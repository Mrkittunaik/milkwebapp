/* =========================================================
   AUTH
   Real phone+OTP and Google login wired to the backend,
   replacing script.js's mockGoogleSignIn()/setTimeout stubs.
   On success this stores a real JWT and opens the socket
   connection so live order/catalog/notification events start
   flowing immediately after login.
========================================================= */

import { authApi, setToken, usersApi } from './api.js';
import { connectSocket } from './socket.js';



export async function sendOtp(phone) {
  return authApi.sendOtp(phone); // { ok, message, devHint? } - devHint only present when OTP_DEV_MODE=true
}

export async function verifyOtp(phone, code) {
  const res = await authApi.verifyOtp(phone, code); // { ok, token, user }
  setToken(res.token);
  await connectSocket();
  return res.user;
}

// Real Google Identity Services integration point.
// Requires adding to index.html:
//   <script src="https://accounts.google.com/gsi/client" async defer></script>
// and setting window.PD_GOOGLE_CLIENT_ID before this module runs.
export function startGoogleSignIn(onCredential) {
  if (!window.google || !window.PD_GOOGLE_CLIENT_ID) {
    console.warn('[auth] Google Identity Services not loaded, or PD_GOOGLE_CLIENT_ID not set');
    return false;
  }
  window.google.accounts.id.initialize({
    client_id: window.PD_GOOGLE_CLIENT_ID,
    callback: (response) => onCredential(response.credential)
  });
  window.google.accounts.id.prompt();
  return true;
}

// The raw credential is a signed JWT from Google. We send it AS-IS to the
// backend, which verifies its signature + audience against Google directly
// (via google-auth-library) before trusting anything inside it. The
// frontend never decodes or reads it - that would defeat the point of
// server-side verification, since a browser value can always be edited.
export async function completeGoogleLogin(credential) {
  const res = await authApi.google(credential); // { ok, token, user, needsPhone }
  setToken(res.token); // token is issued even when needsPhone is true, so
                        // bindPhone below can call the API as this user.
  if (!res.needsPhone) await connectSocket();
  return res; // caller checks res.needsPhone to decide whether to show the bind-phone step
}

export async function bindPhone(phone) {
  const res = await authApi.bindPhone(phone); // identified by the JWT set above, not by an id we send
  await connectSocket();
  return res.user;
}

export async function fetchMyProfile() {
  return usersApi.me();
}
