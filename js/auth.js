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

// Kept for the "bind phone after Google" step, since the backend's
// dev-stage googleAuth still needs the googleId sent by the client
// (see authController.js TODO to swap in real Google token verification).
let pendingGoogleId = null;
let pendingGoogleEmail = null;
let pendingGoogleName = null;

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

// Decodes the Google ID token client-side just to read the profile for
// display before sending it to the backend. NOTE: this is NOT a security
// check - the backend's TODO to verify the token server-side (via
// google-auth-library) still needs doing before this goes to production;
// until then the backend trusts whatever googleId the client sends.
function decodeGoogleCredential(credential) {
  const payload = JSON.parse(atob(credential.split('.')[1]));
  return { googleId: payload.sub, email: payload.email, name: payload.name };
}

export async function completeGoogleLogin(credential) {
  const { googleId, email, name } = decodeGoogleCredential(credential);
  pendingGoogleId = googleId;
  pendingGoogleEmail = email;
  pendingGoogleName = name;

  const res = await authApi.google(googleId, email, name); // { ok, token, user, needsPhone }
  setToken(res.token);
  if (!res.needsPhone) await connectSocket();
  return res; // caller checks res.needsPhone to decide whether to show the bind-phone step
}

export async function bindPhone(phone) {
  if (!pendingGoogleId) throw new Error('No Google sign-in in progress');
  const res = await authApi.bindPhone(pendingGoogleId, phone); // { ok, user } - matched by googleId, not JWT
  await connectSocket();
  return res.user;
}

export async function fetchMyProfile() {
  return usersApi.me();
}
