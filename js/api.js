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

export function isLoggedIn() {
  return !!getToken();
}

// Decodes the role out of the JWT payload without needing a library -
// just base64-decodes the middle segment. Not for security checks
// (the server always re-verifies), only for showing/hiding UI.
export function getTokenRole() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch (e) { return null; }
}

export function getTokenUserId() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || null;
  } catch (e) { return null; }
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
  } catch (networkErr) {
    throw new ApiError('Network error - is the backend running?', 0, null);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = text; }
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
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
  google: (googleId, email, name) => api.post('/api/auth/google', { googleId, email, name }, { auth: false }),
  bindPhone: (googleId, phone) => api.post('/api/auth/bind-phone', { googleId, phone }, { auth: false }),
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
  createOrder: (amount, currency = 'INR') => api.post('/api/payments/create-order', { amount, currency }),
  verify: (orderId, paymentId, signature) => api.post('/api/payments/verify', { orderId, paymentId, signature })
};

/* ---------------- Delivery boy (self) ---------------- */
export const deliveryApi = {
  me: () => api.get('/api/delivery-boys/me'),
  updateLocation: (lat, lng) => api.patch('/api/delivery-boys/me/location', { lat, lng })
};

export { ApiError };
