/* =========================================================
   AUTH
   Real phone+OTP and Google login wired to the backend,
   replacing script.js's mockGoogleSignIn()/setTimeout stubs.
   On success this stores a real JWT and opens the socket
   connection so live order/catalog/notification events start
   flowing immediately after login.
========================================================= */

import { authApi, setToken, usersApi } from './api.js';
import { connectSocket, disconnectSocket } from './socket.js';



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
//
// IMPORTANT: two things do NOT work reliably, especially on mobile:
//   1. window.google.accounts.id.prompt() (the "One Tap" overlay) - Google
//      silently refuses to show it in a lot of mobile contexts (iOS Safari,
//      in-app browsers, blocked third-party cookies/no FedCM support) with
//      zero error, so the button just does nothing.
//   2. Calling .click() on Google's own rendered button from our JS - Google
//      does not treat a synthetic click as a real user gesture, so the
//      popup/redirect never opens, even though nothing throws.
// The only flow guaranteed to work everywhere is rendering Google's real
// button and letting the user tap IT directly. So this renders that real
// button into #googleSignInRealBtn (visible, styled to fit) on load, and
// our own "Continue with Google" button is hidden entirely.
//
// onCredential(credential) fires when the user picks an account.
export function initGoogleSignIn(onCredential) {
  const container = document.getElementById('googleSignInRealBtn');
  if (!window.google || !window.PD_GOOGLE_CLIENT_ID || !container) {
    console.warn('[auth] Google Identity Services not loaded, or PD_GOOGLE_CLIENT_ID/container missing');
    return false;
  }
  window.google.accounts.id.initialize({
    client_id: window.PD_GOOGLE_CLIENT_ID,
    callback: (response) => onCredential(response.credential),
    ux_mode: 'popup' // browsers/webviews that can't do a popup fall back to a full-page redirect automatically
  });
  window.google.accounts.id.renderButton(container, {
    type: 'standard', theme: 'outline', size: 'large', width: 320, text: 'continue_with'
  });
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

// Full logout: clears our own JWT (script.js's clearSession() only wiped
// its local userSession object + localStorage cache, never this token -
// so the backend still treated the old session as logged in, and on top
// of that Google's own "remember this account" auto-select would silently
// hand back the same account next time, making it look like logout never
// worked at all). This clears all three:
//   1. our JWT, so the backend session is actually gone
//   2. the live socket connection, so no more live events for this user
//   3. Google's auto-select flag, so the account picker is shown again
//      next time instead of Google silently re-picking the same account
export function logout() {
  try{ setToken(null); } catch(e){ console.warn('[auth] logout: clearing token failed', e); }
  try{ disconnectSocket(); } catch(e){ console.warn('[auth] logout: disconnecting socket failed', e); }
  try{
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch(e){ console.warn('[auth] logout: Google disableAutoSelect failed', e); }
}
