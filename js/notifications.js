/* =========================================================
   NOTIFICATIONS
   Replaces script.js's seedNotifications() fake list with real
   events. Two layers:
     1. In-app bell (works today) - listens to the socket events
        emit.js already sends (order:status, order:assigned,
        payment:changed, subscription:changed, catalog:changed)
        and turns each into a notification-panel entry, live.
     2. Browser push (works today, once the user grants
        permission) - a local Notification API popup so the
        alert shows even if the tab isn't focused.

   NOTE: this does not yet persist notification history server-side
   or send anything when the app is fully closed - that needs the
   backend Notification model + a real Web Push subscription
   endpoint (Phase 2, not built yet). Everything here works for as
   long as the app tab has been opened at least once this session.
========================================================= */

import { onSocket } from './socket.js';

const notifications = []; // {title, sub, kind, time}
let renderBadgeFn = null;
let renderListFn = null;

function pushNotification({ title, sub, kind }) {
  const n = { title, sub, kind, time: new Date() };
  notifications.unshift(n);
  if (renderBadgeFn) renderBadgeFn(notifications.length);
  if (renderListFn) renderListFn(notifications);
  showBrowserPush(title, sub);
}

/* ---------------- Browser push (local Notification API) ---------------- */
export async function requestPushPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function showBrowserPush(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // Only pop a native browser notification if the tab is hidden/backgrounded -
  // if the user is actively looking at the app, the in-app bell + toast is enough.
  if (document.visibilityState === 'visible') return;
  try {
    new Notification(title, { body, icon: 'logo.png' });
  } catch (e) { /* some browsers restrict this outside a service worker - safe to ignore */ }
}

/* ---------------- Wiring real events to notification entries ---------------- */
export function initNotifications({ onBadgeUpdate, onListUpdate, myUserId }) {
  renderBadgeFn = onBadgeUpdate;
  renderListFn = onListUpdate;

  onSocket('order:status', (order) => {
    if (String(order.customer) !== String(myUserId)) return;
    const map = {
      preparing: ['Order confirmed', `Order ${order.orderCode} is being prepared`, 'order'],
      pending_acceptance: ['Finding a delivery partner', `Order ${order.orderCode} is being offered to nearby delivery partners`, 'order'],
      out: ['Out for delivery', `Order ${order.orderCode} is on its way`, 'order'],
      delivered: ['Order delivered', `Order ${order.orderCode} was delivered`, 'deliver'],
      cancelled: ['Order cancelled', `Order ${order.orderCode} was cancelled`, 'skip']
    };
    const entry = map[order.status];
    if (entry) pushNotification({ title: entry[0], sub: entry[1], kind: entry[2] });
  });

  onSocket('order:assigned', (order) => {
    if (String(order.customer) !== String(myUserId)) return;
    pushNotification({
      title: 'Delivery partner assigned',
      sub: `Your order ${order.orderCode} has been picked up for delivery`,
      kind: 'order'
    });
  });

  onSocket('payment:changed', (payment) => {
    if (payment.customer && String(payment.customer) !== String(myUserId)) return;
    if (payment.status === 'success' || payment.status === 'verified') {
      pushNotification({ title: 'Payment received', sub: `₹${payment.amount} payment confirmed`, kind: 'deliver' });
    }
  });

  onSocket('subscription:changed', (sub) => {
    if (String(sub.customer) !== String(myUserId)) return;
    pushNotification({ title: 'Subscription updated', sub: 'Your plan schedule was updated', kind: 'renew' });
  });

  onSocket('catalog:changed', ({ kind }) => {
    if (kind === 'banner') {
      pushNotification({ title: 'New offer available', sub: 'Check out the latest deals', kind: 'promo' });
    }
  });

  onSocket('user:status', (user) => {
    if (String(user._id) === String(myUserId) && user.status === 'blocked') {
      pushNotification({ title: 'Account restricted', sub: 'Please contact support', kind: 'skip' });
    }
  });
}

export function getNotifications() {
  return notifications;
}
