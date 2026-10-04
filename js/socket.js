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

let socketToken = null;       // token the current socket was opened with
let connecting = null;        // in-flight connect promise (prevents double sockets)

export async function connectSocket() {
  const token = getToken() || null;

  // Reuse the existing socket only if it belongs to the same identity.
  // A different token (login / logout / account switch) must never keep
  // receiving the previous user's personal room events.
  if (socket && socketToken === token) return socket;
  if (socket && socketToken !== token) disconnectSocket();
  if (connecting) return connecting;

  connecting = (async () => {
    await loadSocketIoScript();

    // Logged-in users authenticate to get their personal rooms (orders,
    // notifications). Guests connect with no token at all - the backend
    // still puts every connection into the public 'catalog' room.
    socketToken = token;
    socket = window.io(API_BASE, token ? { auth: { token } } : {});

    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error:', err && err.message);
    });

    // Attach each registered listener exactly once on this socket.
    pendingHandlers.forEach(({ event, cb }) => {
      socket.off(event, cb);
      socket.on(event, cb);
    });
    return socket;
  })();

  try { return await connecting; }
  finally { connecting = null; }
}

export function disconnectSocket() {
  if (socket) {
    try { socket.removeAllListeners(); } catch (e) { /* ignore */ }
    try { socket.disconnect(); } catch (e) { /* ignore */ }
    socket = null;
    socketToken = null;
  }
}

// Drops every registered listener (used on logout so the previous user's
// handlers - bound to their user id - can never fire for the next user).
export function clearSocketHandlers() {
  pendingHandlers.length = 0;
}

// Register a listener even if the socket isn't connected yet (e.g. called
// during page setup, before login). It attaches immediately if possible,
// and gets replayed onto the socket once connectSocket() runs.
export function onSocket(event, cb) {
  if (pendingHandlers.some(h => h.event === event && h.cb === cb)) return; // no duplicate registration
  pendingHandlers.push({ event, cb });
  if (socket) socket.on(event, cb);
}

export function emitSocket(event, payload) {
  if (socket && socket.connected) socket.emit(event, payload);
}

export function isSocketConnected() {
  return !!(socket && socket.connected);
}
