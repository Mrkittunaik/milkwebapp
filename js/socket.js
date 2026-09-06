/* =========================================================
   SOCKET.IO CLIENT
   One shared connection for the whole app. Connects on page load
   for EVERYONE - guests included, with no auth token - so live
   catalog updates (new/edited/removed products, price changes)
   reach every visitor instantly. Logged-in users additionally pass
   their JWT to unlock personal rooms (orders, notifications).

   Import { connectSocket, onSocket, emitSocket } from this file.
========================================================= */

import { API_BASE, getToken } from './api.js';

let socket = null;
const pendingHandlers = []; // handlers registered before connect() runs

function loadSocketIoScript() {
  return new Promise((resolve, reject) => {
    if (window.io) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load socket.io client'));
    document.head.appendChild(s);
  });
}

export async function connectSocket() {
  if (socket && socket.connected) return socket;

  await loadSocketIoScript();

  // Logged-in users authenticate to get their personal rooms (orders,
  // notifications). Guests connect with no token at all - the backend
  // still puts every connection (auth or not) into the public 'catalog'
  // room, so live product/price/banner updates work whether or not
  // the visitor is logged in.
  const token = getToken();
  socket = window.io(API_BASE, token ? { auth: { token } } : {});

  socket.on('connect_error', (err) => {
    console.warn('[socket] connect error:', err.message);
  });

  // Re-attach any listeners that were registered before the socket existed.
  pendingHandlers.forEach(({ event, cb }) => socket.on(event, cb));

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Register a listener even if the socket isn't connected yet (e.g. called
// during page setup, before login). It attaches immediately if possible,
// and gets replayed onto the socket once connectSocket() runs.
export function onSocket(event, cb) {
  pendingHandlers.push({ event, cb });
  if (socket) socket.on(event, cb);
}

export function emitSocket(event, payload) {
  if (socket && socket.connected) socket.emit(event, payload);
}

export function isSocketConnected() {
  return !!(socket && socket.connected);
}
