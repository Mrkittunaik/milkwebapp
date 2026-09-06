/* =========================================================
   ORDERS (customer side)
   Real order placement + live tracking. Replaces script.js's
   placeOrder() fake timers and beginLiveTracking() simulation
   with actual backend calls and socket.io room events.
========================================================= */

import { ordersApi } from './api.js';
import { onSocket, emitSocket } from './socket.js';

let currentTrackedOrderId = null;

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
// Call when the customer opens the "Live Tracking" screen for a specific order.
// Joins that order's socket room so driver:location / order:status events for
// THIS order specifically start arriving (in addition to the general
// per-user events every order already gets).
export function startTrackingOrder(orderId, handlers = {}) {
  currentTrackedOrderId = orderId;
  emitSocket('order:track', orderId);

  if (handlers.onLocation) onSocket('driver:location', handlers.onLocation);
  if (handlers.onStatus) onSocket('order:status', (order) => {
    if (String(order._id) === String(orderId)) handlers.onStatus(order);
  });
  if (handlers.onAssigned) onSocket('order:assigned', (order) => {
    if (String(order._id) === String(orderId)) handlers.onAssigned(order);
  });
}

export function stopTrackingOrder() {
  if (currentTrackedOrderId) {
    emitSocket('order:untrack', currentTrackedOrderId);
    currentTrackedOrderId = null;
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
