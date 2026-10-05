/* ============================================================
   API CLIENT — connects deliverymilk (partner app) to the same
   real backend as miLKadmin and milkwebapp (pakkabackend).
   Endpoints match milkwebapp/js/api.js's deliveryApi/authApi/ordersApi.
   ============================================================ */
(function (global) {
  "use strict";

  const API_BASE = (global.MILK_API_BASE || 'https://pakkabackend.onrender.com') + '/api';
  const SOCKET_BASE = (global.MILK_API_BASE || 'https://pakkabackend.onrender.com');
  const TOKEN_KEY = 'pd_delivery_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function getTokenRole() {
    const token = getToken();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])).role || null; } catch (e) { return null; }
  }
  function getTokenUserId() {
    const token = getToken();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])).id || null; } catch (e) { return null; }
  }

  const DEFAULT_TIMEOUT_MS = 20000;

  // Normalises every failure into one Error shape the UI can switch on:
  //   err.status  HTTP status (0 when the request never got an answer)
  //   err.code    server error code ("PAYMENT_ALREADY_COMPLETED", "AUTH_EXPIRED"...) or
  //               "NETWORK" / "TIMEOUT" when we never heard back
  //   err.network true when the outcome of the request is UNKNOWN (it may or may not
  //               have reached the server) - callers must re-check server state, not assume failure
  function buildError(res, data, fallback) {
    // supports both the legacy { error: "text", code } and the payment API { success:false, error:{code,message} }
    const e = data && data.error;
    const message = (e && typeof e === 'object' ? e.message : e) || fallback;
    const err = new Error(message);
    err.status = res.status;
    err.code = (e && typeof e === 'object' ? e.code : data && data.code) || null;
    return err;
  }

  async function rawFetch(url, init, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      return await fetch(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
    } catch (e) {
      const err = new Error(e && e.name === 'AbortError' ? 'The request timed out' : 'No internet connection');
      err.status = 0;
      err.network = true;
      err.code = e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function request(method, path, body, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const init = { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined };

    // Reads are safe to retry once on a network blip. Writes are NEVER blindly retried here:
    // a payment write that timed out may have succeeded, so the caller re-reads server state
    // (and reuses its Idempotency-Key) instead.
    const attempts = method === 'GET' ? 2 : 1;
    let res, lastErr;
    for (let i = 0; i < attempts; i++) {
      try { res = await rawFetch(API_BASE + path, init, opts.timeoutMs || DEFAULT_TIMEOUT_MS); lastErr = null; break; }
      catch (e) { lastErr = e; if (i + 1 < attempts) await new Promise(r => setTimeout(r, 600)); }
    }
    if (lastErr) throw lastErr;

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw buildError(res, data, `Request failed (${res.status})`);
    return data;
  }

  async function requestForm(path, formData) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await rawFetch(API_BASE + path, { method: 'POST', headers, body: formData }, 60000);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw buildError(res, data, `Upload failed (${res.status})`);
    return data;
  }

  const get = (path) => request('GET', path);
  const post = (path, body, opts) => request('POST', path, body, opts);
  const put = (path, body) => request('PUT', path, body);
  const patch = (path, body) => request('PATCH', path, body);
  const del = (path) => request('DELETE', path);

  const Api = {
    getToken, setToken, getTokenRole, getTokenUserId,

    // ---- auth (delivery partner) ----
    deliveryLogin: (phone, password) => post('/auth/delivery/login', { phone, password }),
    deliveryRegister: (payload) => post('/auth/delivery/register', payload),

    // ---- self profile ----
    me: () => get('/delivery-boys/me'),
    updateLocation: (lat, lng) => patch('/delivery-boys/me/location', { lat, lng }),
    // The backend only exposes image upload at /delivery-boys/:id/image
    // (there's no "/me/image" route) - the caller must pass their own
    // DeliveryBoy _id, e.g. from a cached Api.me() result. requireRole
    // allows 'delivery' to hit this on their own id (see deliveryBoyRoutes.js).
    uploadMyImage: (driverId, file, field) => {
      const form = new FormData();
      form.append('image', file);
      form.append('field', field || 'avatar');
      return requestForm(`/delivery-boys/${driverId}/image`, form);
    },

    // ---- orders ----
    // "my" orders = orders assigned to / offered to this partner. The
    // backend scopes /orders to the caller's role via the JWT, same as
    // it does for the customer webapp and the admin panel. This list
    // includes both admin-assigned stops and broadcast-accepted ones.
    listMyOrders: () => get('/orders'),
    getOrder: (id) => get(`/orders/${id}`),
    respondToOrder: (id, action) => patch(`/orders/${id}/respond`, { action }), // action: 'accept' | 'reject'
    // extra: e.g. { collectedCash: true } when the rider confirms cash was taken while a UPI QR was still open
    updateOrderStatus: (id, status, extra) => patch(`/orders/${id}/status`, Object.assign({ status }, extra || {})),

    // ---- payments (server is the single source of truth; the app never reports "paid") ----
    // A fresh key per user-initiated "show QR" action. Re-send the SAME key if the outcome of a
    // request is unknown (timeout/offline) so the server returns the original attempt instead of a second one.
    newIdempotencyKey: () => (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID()
      : 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12),
    // What to render for this order right now: { order, payment|null, canPay, reason }
    getOrderPayment: (orderId, refresh) => get(`/orders/${orderId}/payment${refresh ? '?refresh=1' : ''}`),
    getPayment: (paymentId, refresh) => get(`/payments/${paymentId}${refresh ? '?refresh=1' : ''}`),
    // create-or-resume: the amount is decided by the server, only the order id is sent
    startPayment: (orderId, idempotencyKey) => post('/payments', { orderId }, { headers: { 'Idempotency-Key': idempotencyKey } }),
    // cancels the payment ATTEMPT only; the order stays payable
    cancelPayment: (paymentId) => post(`/payments/${paymentId}/cancel`),

    // ---- subscriptions (bottle-exchange route) ----
    // All subscriptions the backend will hand back for this caller. There's
    // no rider-specific filter on the backend yet (GET /subscriptions only
    // scopes by customer for role:customer) - callers with role:delivery
    // get every subscription back and must filter client-side by
    // sub.deliveryBoy === their own id (see script.js loadSubscriptionsFromServer).
    listSubscriptions: () => get('/subscriptions'),
    // Completes a subscription stop with dual proof-of-exchange photos
    // (new bottle handed over + old bottle collected) instead of the
    // single generic proof used for one-off product orders. Matches the
    // real backend route: POST /subscriptions/:id/log-delivery, multipart
    // fields newBottlePhoto/oldBottlePhoto, body quantityCollected/
    // shortfall/bottlesGiven (see subscriptionController.logDelivery).
    completeBottleExchange: (subId, data) => {
      const form = new FormData();
      if (data.newBottlePhoto) form.append('newBottlePhoto', data.newBottlePhoto);
      if (data.oldBottlePhoto) form.append('oldBottlePhoto', data.oldBottlePhoto);
      form.append('quantityCollected', data.quantityCollected);
      if (data.shortfall !== undefined) form.append('shortfall', data.shortfall);
      if (data.bottlesGiven !== undefined) form.append('bottlesGiven', data.bottlesGiven);
      return requestForm(`/subscriptions/${subId}/log-delivery`, form);
    },
    // Logs that the customer didn't have the old bottle(s) ready today.
    // The backend has no dedicated "not returned" endpoint - the real
    // mechanism is log-delivery with a shortfall count, which is what
    // bumps Subscription.pendingBottles server-side (see logDelivery).
    reportBottleNotReturned: (subId, shortfallQty) =>
      Api.completeBottleExchange(subId, { quantityCollected: 0, shortfall: shortfallQty, bottlesGiven: 0 }),
    // Raises a ticket for admin review (broken/damaged bottle claimed by
    // customer). Admin approving it is what actually debits the wallet -
    // this call only files the claim. Matches the real backend route:
    // POST /bottle-tickets (role:delivery), multipart field "photo".
    raiseBottleTicket: (subId, data) => {
      const form = new FormData();
      if (data.photo) form.append('photo', data.photo);
      form.append('subscription', subId);
      form.append('reason', data.reason);
      if (data.note) form.append('note', data.note);
      return requestForm('/bottle-tickets', form);
    },

    // ---- realtime ----
    // Mirrors miLKadmin/api.js's retry pattern for a slow/cold-starting
    // backend, since this app can't assume socket.io has finished loading.
    connectSocket(handlers, onReady) {
      let attempts = 0;
      const maxAttempts = 15;
      const tryConnect = () => {
        if (typeof io === 'undefined') {
          attempts++;
          if (attempts >= maxAttempts) {
            console.warn('Socket.IO client still not loaded after retries — staying on polling.');
            return;
          }
          setTimeout(tryConnect, 2000);
          return;
        }
        const socket = io(SOCKET_BASE, { auth: { token: getToken() } });
        Object.keys(handlers || {}).forEach(evt => socket.on(evt, handlers[evt]));
        if (typeof onReady === 'function') {
          socket.on('connect', () => onReady(socket));
        }
      };
      tryConnect();
      return null;
    }
  };

  global.Api = Api;
})(window);
