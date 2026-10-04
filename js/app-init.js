/* =========================================================
   APP INIT
   Wires all the new backend-connected modules together.
   Loaded as a module from index.html, AFTER script.js (so
   script.js's DOM setup and cart object already exist), and
   exposes a couple of window.* hooks that script.js's existing
   code calls into - this keeps script.js edits minimal instead
   of a full rewrite.

   Set window.PD_API_BASE before this runs if the backend isn't
   on http://localhost:5000 (see index.html patch notes).
========================================================= */

import { isLoggedIn, getTokenUserId, usersApi, paymentsApi } from './api.js';
import { connectSocket } from './socket.js';
import { initProducts, getProductById, searchProducts, setSearchTerm, highlightInHomeRail } from './products.js';
import { initPlans, getPlanById } from './plan.js';
import { initBanners } from './banners.js';
import { initLiveLocation } from './live-location.js';
import { initNotifications, requestPushPermission } from './notifications.js';
import { placeRealOrder, startTrackingOrder, stopTrackingOrder, onMyOrdersChanged, fetchMyOrders } from './orders.js';
import { sendOtp, verifyOtp, completeGoogleLogin, bindPhone, initGoogleSignIn, logout, verifySession, clearUserData, initCrossTabSync, fetchMyProfile } from './auth.js';

// ---- Products: fetch real catalog, wire "+" buttons into the EXISTING
// cart object that script.js already maintains (window.cart), so cart
// rendering/checkout logic in script.js keeps working unmodified. ----
initProducts({
  onAdd: ({ id, name, price }, btnEl) => {
    // Capture the button's position and fire the fly-to-cart animation
    // BEFORE addToCart, since addToCart triggers renderCart() ->
    // onCartChanged() -> renderGrid(), which replaces btnEl's card
    // (and btnEl itself) with a fresh stepper. Doing it after would
    // measure a detached element and the animation would never show.
    if (typeof window.flyToCart === 'function') window.flyToCart(btnEl);
    if (typeof window.addToCart === 'function') {
      window.addToCart(name, price, id); // script.js patch: accept optional productId, see notes
    }
  }
});

// ---- Plans/packages: fetch from admin-managed plans, live over sockets.
// "Subscribe" adds it to the same cart as products (script.js already
// handles checkout for whatever's in window.cart, so no extra plumbing). ----
initPlans({
  onAdd: ({ id, name, price }, btnEl) => {
    if (typeof window.flyToCart === 'function') window.flyToCart(btnEl);
    if (typeof window.addToCart === 'function') {
      window.addToCart(name, price, id);
    }
  }
});

// ---- Home banners: fetch from admin-managed banners, live over sockets ----
initBanners();

// ---- Live location: exact GPS "you are here" dot inside the location
// popup (opened by tapping the nav's "Delivering to" row). Only registers
// the start/stop hooks here - script.js's openLocModal()/closeLocModal()
// call them so GPS only runs while the popup is actually open. ----
initLiveLocation();

// ---- Search: expose real product search to script.js's top-nav search
// box (see the TOP NAV SEARCH block at the bottom of script.js). ----
window.PD_SEARCH = { searchProducts, setSearchTerm, highlightInHomeRail };

// ---- Own profile: expose real update-profile call to script.js's Edit
// Profile modal on the Account screen. ----
window.PD_USER = { updateMe: usersApi.updateMe };

// ---- Auth: expose real calls for script.js's existing button handlers
// to call instead of the mock timeouts. See index.html/script.js patch
// notes for the exact lines to swap. ----
window.PD_REAL_AUTH = {
  sendOtp,
  verifyOtp,
  completeGoogleLogin,
  bindPhone,
  initGoogleSignIn,
  logout,
  getTokenUserId,
  isLoggedIn,
  verifySession,
  clearUserData,
  fetchMyProfile,
  startUserRealtime: () => startUserRealtime()
};

// Other tabs logging in/out/switching reload this tab into a clean state.
initCrossTabSync();

// ---- Orders: expose real order placement + tracking ----
window.PD_REAL_ORDERS = {
  placeRealOrder,
  startTrackingOrder,
  stopTrackingOrder,
  onMyOrdersChanged,
  fetchMyOrders
};

// ---- Payments: real Razorpay create-order/verify calls. script.js's
// launchPaymentGateway() calls these instead of talking to fetch()/api.js
// directly, same bridging pattern as PD_REAL_ORDERS above. ----
window.PD_PAYMENTS = {
  createOrder: paymentsApi.createOrder,
  verify: paymentsApi.verify
};

// ---- Per-user realtime wiring (notifications bell, live "My Orders").
// Idempotent per account: calling it again for the same user is a no-op, so
// listeners are never registered twice. A different account always arrives
// via a full page reload (logout reloads), which resets all of this. ----
let realtimeStartedFor = null;
async function startUserRealtime() {
  if (!isLoggedIn()) return;
  const myUserId = getTokenUserId();
  if (!myUserId || realtimeStartedFor === myUserId) return;
  realtimeStartedFor = myUserId;

  await connectSocket(); // re-opens the socket with THIS user's token if needed

  initNotifications({
    myUserId,
    onBadgeUpdate: (count) => {
      const dot = document.getElementById('subBellDot');
      if (dot) dot.classList.toggle('show', count > 0);
      const topBadge = document.getElementById('topNotifBadge');
      if (topBadge) {
        topBadge.textContent = count > 9 ? '9+' : String(count);
        topBadge.style.display = count > 0 ? 'flex' : 'none';
      }
    },
    onListUpdate: (list) => {
      window.__liveNotifications = list;
      if (typeof window.renderNotifList === 'function') window.renderNotifList();
    }
  });

  // Ask for browser push permission once, quietly (only for logged-in users).
  requestPushPermission();

  // Keep "My Orders" fresh: apply the pushed order straight into the
  // in-memory list (no refetch round-trip).
  onMyOrdersChanged((order) => {
    if (typeof window.applyLiveOrderUpdate === 'function') window.applyLiveOrderUpdate(order);
    else if (typeof window.renderOrderHistory === 'function') window.renderOrderHistory();
  });
}

// ---- Connect the realtime channel for EVERYONE, guest or logged in, so
// live product/price/banner updates (catalog:changed) reach every visitor
// immediately. Login-only features start via startUserRealtime(), which
// script.js also calls right after a successful login. ----
(async function boot() {
  await connectSocket();
  if (isLoggedIn()) startUserRealtime();
})();
