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

import { isLoggedIn, getTokenUserId, usersApi } from './api.js';
import { connectSocket } from './socket.js';
import { initProducts, getProductById } from './products.js';
import { initNotifications, requestPushPermission } from './notifications.js';
import { placeRealOrder, startTrackingOrder, stopTrackingOrder, onMyOrdersChanged, fetchMyOrders } from './orders.js';
import { sendOtp, verifyOtp, completeGoogleLogin, bindPhone, startGoogleSignIn } from './auth.js';

// ---- Products: fetch real catalog, wire "+" buttons into the EXISTING
// cart object that script.js already maintains (window.cart), so cart
// rendering/checkout logic in script.js keeps working unmodified. ----
initProducts({
  onAdd: ({ id, name, price }, btnEl) => {
    if (typeof window.addToCart === 'function') {
      window.addToCart(name, price, id); // script.js patch: accept optional productId, see notes
    }
    if (typeof window.flyToCart === 'function') window.flyToCart(btnEl);
  }
});

// ---- Auth: expose real calls for script.js's existing button handlers
// to call instead of the mock timeouts. See index.html/script.js patch
// notes for the exact lines to swap. ----
window.PD_REAL_AUTH = {
  sendOtp,
  verifyOtp,
  completeGoogleLogin,
  bindPhone,
  startGoogleSignIn,
  getTokenUserId
};

// ---- Orders: expose real order placement + tracking ----
window.PD_REAL_ORDERS = {
  placeRealOrder,
  startTrackingOrder,
  stopTrackingOrder,
  fetchMyOrders
};

// ---- If already logged in from a previous session, reconnect the
// socket immediately and start the notification listener. ----
(async function boot() {
  if (!isLoggedIn()) return;
  await connectSocket();
  const myUserId = getTokenUserId();

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
      // Reuses script.js's existing renderNotifList() rendering if present,
      // by exposing the live list on window for it to read.
      window.__liveNotifications = list;
      if (typeof window.renderNotifList === 'function') window.renderNotifList();
    }
  });

  // Ask for browser push permission once, quietly (no blocking prompt on load
  // for guests - only for logged-in users, and only if not already answered).
  requestPushPermission();

  // Keep "My Orders" screen fresh without the user pulling to refresh.
  onMyOrdersChanged(() => {
    if (typeof window.renderOrdersScreen === 'function') window.renderOrdersScreen();
  });
})();
