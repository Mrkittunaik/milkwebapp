/* =========================================================
   ORDERS (customer side)
   Real order placement + live tracking. Replaces script.js's
   placeOrder() fake timers and beginLiveTracking() simulation
   with actual backend calls and socket.io room events.
========================================================= */

import { ordersApi } from './api.js';
import { onSocket, emitSocket } from './socket.js';

let listenersAttached = false;
// orderId -> { driverId, handlers: {onLocation, onStatus, onAssigned} }
// driverId starts null until the order's onStatus/onAssigned tells us who
// was assigned - driver:location pings are matched against it below so a
// card only reacts to ITS OWN driver's pings, not every tracked order's.
const trackedOrders = new Map();

// The backend broadcasts driver:location into the room(s) any tracking
// client has joined (order:${orderId}), but a single client socket has one
// shared 'driver:location' listener for ALL joined rooms combined - the
// payload's driverId is what disambiguates which tracked order (if more
// than one) a given ping actually belongs to.
function attachGlobalListenersOnce() {
  if (listenersAttached) return;
  listenersAttached = true;

  onSocket('driver:location', (payload) => {
    trackedOrders.forEach((entry) => {
      if (!entry.handlers.onLocation) return;
      // Until we know the assigned driverId (order not yet assigned when
      // tracking started), accept any ping for a single-order-tracked
      // screen; once known, only match that driver.
      if (entry.driverId && payload.driverId && String(payload.driverId) !== String(entry.driverId)) return;
      entry.handlers.onLocation(payload);
    });
  });
  onSocket('order:status', (order) => {
    const entry = trackedOrders.get(String(order._id));
    if (!entry) return;
    if (order.assigned) entry.driverId = order.assigned._id || order.assigned;
    if (entry.handlers.onStatus) entry.handlers.onStatus(order);
  });
  onSocket('order:assigned', (order) => {
    const entry = trackedOrders.get(String(order._id));
    if (!entry) return;
    if (order.assigned) entry.driverId = order.assigned._id || order.assigned;
    if (entry.handlers.onAssigned) entry.handlers.onAssigned(order);
  });
}

// cart shape in: { [name]: { id, name, price, qty } } (script.js's existing cart object,
// now expected to also carry a productId per item - see the cart.js patch notes)
export async function placeRealOrder({ cart, address, lat, lng, couponCode, paymentStatus, paymentRef, slot }) {
  const items = Object.values(cart).map(item => ({ productId: item.id, qty: item.qty }));
  const order = await ordersApi.create({
    items, address, lat, lng, couponCode, paymentStatus, paymentRef, slot
  });
  return order; // full Order document from the backend, incl. real orderCode/total
}

export async function fetchMyOrders(status) {
  return ordersApi.list(status);
}

export async function fetchOrder(orderId) {
  return ordersApi.getOne(orderId);
}

/* ---------------- Live tracking ---------------- */
// Call when the customer opens live tracking for a specific order - the
// full-screen track view, or a mini-map card on the Orders screen. Supports
// tracking multiple orders concurrently (e.g. several live-order-cards at
// once); each gets its own handlers and its own order:${id} room.
// Pass knownDriverId if the order's `assigned` driver is already known
// (e.g. from the order list) so location pings are scoped correctly from
// the start instead of only after the next order:status event.
export function startTrackingOrder(orderId, handlers = {}, knownDriverId = null) {
  attachGlobalListenersOnce();
  trackedOrders.set(String(orderId), { driverId: knownDriverId, handlers });
  emitSocket('order:track', orderId);
}

// Stops tracking one specific order. Pass no argument to stop ALL
// currently-tracked orders (used when navigating away entirely).
export function stopTrackingOrder(orderId) {
  if (orderId === undefined) {
    trackedOrders.forEach((_, id) => emitSocket('order:untrack', id));
    trackedOrders.clear();
    return;
  }
  const key = String(orderId);
  if (trackedOrders.has(key)) {
    emitSocket('order:untrack', key);
    trackedOrders.delete(key);
  }
}

/* ---------------- Live order-list updates (My Orders screen) ---------------- */
// Fires whenever ANY of the customer's own orders changes status (assigned,
// out for delivery, delivered, etc) so the Orders screen can refresh that
// single card without a full reload or refetch.
export function onMyOrdersChanged(cb) {
  onSocket('order:status', cb);
  onSocket('order:assigned', cb);
}
