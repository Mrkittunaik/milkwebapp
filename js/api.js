/* =========================================================
   API CLIENT
   Single source of truth for the backend URL, the auth token,
   and every fetch() call the app makes. Every other module
   imports from here instead of calling fetch() directly.
========================================================= */

// Change this one line when you deploy the backend (Render/Railway/VPS).
// Keeping it in one place means the rest of the app never hardcodes a URL.
export const API_BASE = window.PD_API_BASE || 'http://localhost:5000';

const TOKEN_KEY = 'pd_auth_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); }
  catch (e) { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* storage unavailable (private mode / file://) */ }
}

// Decodes the JWT payload (UI use only - the server always re-verifies).
function decodeTokenPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (e) { return null; }
}

// A token that is missing, malformed or past its `exp` counts as logged out,
// so a stale localStorage token can never make the UI look authenticated.
export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  const payload = decodeTokenPayload(token);
  if (!payload) return false;
  if (payload.exp && payload.exp * 1000 <= Date.now()) return false;
  return true;
}

// Fired when the backend rejects our token (401) or it has expired locally.
// script.js listens and performs a clean logout + login prompt.
export function notifySessionExpired() {
  try { window.dispatchEvent(new CustomEvent('pd:session-expired')); } catch (e) { /* ignore */ }
}

// Decodes the role out of the JWT payload without needing a library -
// just base64-decodes the middle segment. Not for security checks
// (the server always re-verifies), only for showing/hiding UI.
export function getTokenRole() {
  if (!isLoggedIn()) return null;
  const payload = decodeTokenPayload(getToken());
  return (payload && payload.role) || null;
}

export function getTokenUserId() {
  if (!isLoggedIn()) return null;
  const payload = decodeTokenPayload(getToken());
  return (payload && payload.id) || null;
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const REQUEST_TIMEOUT_MS = 20000;

// Turns any backend/network failure into a message that is safe to show a
// customer. 4xx validation messages written by our own backend (short plain
// strings such as "Incorrect OTP") are passed through; anything that could
// carry internals (5xx, HTML error pages, stack traces, long strings) is
// replaced with a generic message.
function friendlyMessage(status, data) {
  const backendMsg = data && typeof data === 'object' && typeof data.error === 'string' ? data.error.trim() : '';
  const looksSafe = backendMsg && backendMsg.length <= 140 && !/[<>{}]|stack|mongo|sql|at\s+\S+\s*\(|ECONN|ENOTFOUND|TypeError|ReferenceError/i.test(backendMsg);
  switch (status) {
    case 0:   return 'Network problem. Please check your internet and try again.';
    case 400:
    case 409:
    case 422: return looksSafe ? backendMsg : 'Please check the details and try again.';
    case 401: return looksSafe ? backendMsg : 'Your session has expired. Please log in again.';
    case 403: return "You don't have permission to access this.";
    case 404: return looksSafe ? backendMsg : 'The requested item could not be found.';
    case 429: return 'Too many attempts. Please try again later.';
    default:
      if (status >= 500) return 'Something went wrong. Please try again.';
      return looksSafe ? backendMsg : 'Something went wrong. Please try again.';
  }
}

async function request(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  let sentToken = null;
  if (auth) {
    const token = getToken();
    if (token) { headers['Authorization'] = `Bearer ${token}`; sentToken = token; }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal
    });
  } catch (networkErr) {
    throw new ApiError(friendlyMessage(0), 0, null);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = null; /* non-JSON (HTML error page etc.) is never shown */ }
  }

  if (!res.ok) {
    // Expired/invalid token on an authenticated call: end the session cleanly
    // (only if the token we sent is still the current one, so a late response
    // from an old session can't log out a newer login).
    if (res.status === 401 && sentToken && getToken() === sentToken) {
      setToken(null);
      notifySessionExpired();
    }
    throw new ApiError(friendlyMessage(res.status, data), res.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body, opts = {}) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true })
};

/* ---------------- Auth ---------------- */
export const authApi = {
  sendOtp: (phone) => api.post('/api/auth/send-otp', { phone }, { auth: false }),
  verifyOtp: (phone, code) => api.post('/api/auth/verify-otp', { phone, code }, { auth: false }),
  google: (credential) => api.post('/api/auth/google', { credential }, { auth: false }),
  // auth: true (default) — the backend now identifies the user from the JWT
  // that /api/auth/google already returned, not from a client-sent id.
  bindPhone: (phone) => api.post('/api/auth/bind-phone', { phone }),
  adminLogin: (email, password) => api.post('/api/auth/admin/login', { email, password }, { auth: false }),
  deliveryLogin: (phone, password) => api.post('/api/auth/delivery/login', { phone, password }, { auth: false }),
  deliveryRegister: (payload) => api.post('/api/auth/delivery/register', payload, { auth: false })
};

/* ---------------- Products ---------------- */
export const productsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/products${qs ? '?' + qs : ''}`);
  },
  getOne: (id) => api.get(`/api/products/${id}`)
};

/* ---------------- Banners ---------------- */
export const bannersApi = {
  list: () => api.get('/api/banners') // public: active banners only, already sorted
};

/* ---------------- Orders ---------------- */
export const ordersApi = {
  create: (payload) => api.post('/api/orders', payload),
  list: (status) => api.get(`/api/orders${status ? '?status=' + status : ''}`),
  getOne: (id) => api.get(`/api/orders/${id}`),
  updateStatus: (id, status) => api.patch(`/api/orders/${id}/status`, { status }),
  assign: (id, deliveryBoyId) => api.patch(`/api/orders/${id}/assign`, { deliveryBoyId }),
  offer: (id, radiusKm) => api.patch(`/api/orders/${id}/offer`, { radiusKm }),
  respond: (id, action) => api.patch(`/api/orders/${id}/respond`, { action })
};

/* ---------------- Users ---------------- */
export const usersApi = {
  me: () => api.get('/api/users/me'),
  updateMe: (payload) => api.put('/api/users/me', payload),
  addAddress: (addr) => api.post('/api/users/me/addresses', addr),
  deleteAddress: (addrId) => api.del(`/api/users/me/addresses/${addrId}`),
  status: (id) => api.get(`/api/users/${id}/status`)
};

/* ---------------- Plans & Subscriptions ---------------- */
export const plansApi = {
  list: () => api.get('/api/plans')
};

export const subscriptionsApi = {
  create: (payload) => api.post('/api/subscriptions', payload),
  list: () => api.get('/api/subscriptions'),
  getOne: (id) => api.get(`/api/subscriptions/${id}`),
  update: (id, payload) => api.put(`/api/subscriptions/${id}`, payload),
  pause: (id) => api.patch(`/api/subscriptions/${id}/pause`),
  resume: (id) => api.patch(`/api/subscriptions/${id}/resume`),
  skipWindow: (id) => api.get(`/api/subscriptions/${id}/skip-window`), // tells UI if today's cutoff has passed
  skipDate: (id, date) => api.post(`/api/subscriptions/${id}/skip`, { date }), // date: 'YYYY-MM-DD'
  unskipDate: (id, date) => api.del(`/api/subscriptions/${id}/skip/${date}`)
};

/* ---------------- Coupons ---------------- */
export const couponsApi = {
  validate: (code, total) => api.get(`/api/coupons/validate?code=${encodeURIComponent(code)}&total=${total}`)
};

/* ---------------- Payments ---------------- */
export const paymentsApi = {
  // Server re-prices the cart itself from items/couponCode - it never
  // trusts a client-sent amount, so don't pass one.
  createOrder: (items, couponCode) => api.post('/api/payments/create-order', { items, couponCode }),
  verify: (razorpay_order_id, razorpay_payment_id, razorpay_signature) =>
    api.post('/api/payments/verify', { razorpay_order_id, razorpay_payment_id, razorpay_signature })
};

/* ---------------- Wallet ----------------
   INTEGRATION POINT: the backend has no wallet routes yet, so nothing calls
   these. js/account-hub.js's walletService switches to them once its
   BACKEND_READY flag is set to true. Paths are proposals - adjust to the API
   you build. Top-ups must be priced and confirmed server-side, like
   paymentsApi.createOrder (never trust a client-sent balance). */
export const walletApi = {
  get: () => api.get('/api/wallet'),                              // -> { balance, currency }
  transactions: () => api.get('/api/wallet/transactions'),        // -> [{ id, type:'credit'|'debit', amount, title, status, createdAt, ref }]
  createTopUp: (amount) => api.post('/api/wallet/top-up', { amount }) // -> same shape as paymentsApi.createOrder
};

/* ---------------- Delivery boy (self) ---------------- */
export const deliveryApi = {
  me: () => api.get('/api/delivery-boys/me'),
  updateLocation: (lat, lng) => api.patch('/api/delivery-boys/me/location', { lat, lng })
};

export { ApiError };
