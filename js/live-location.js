/* =========================================================
   LIVE LOCATION (location popup map)
   -------------------------------------------------------------------------
   Shows the customer's EXACT real-time position inside the "Update
   delivery location" popup (#locBackdrop), Google Maps/Zomato-style:

     - FAST FIRST FIX: shows the dot the moment ANY fix arrives (typically
       1-5s), instead of waiting for a perfect GPS lock. A quick low-accuracy
       fix is way better than a blank map for 15-20 seconds.
     - Then keeps refining silently in the background via watchPosition -
       the dot and accuracy ring update live as the fix improves, without
       blocking or re-showing the "getting location" spinner.
     - enableHighAccuracy:true still asks the device for real GPS chip
       data (not just network approximation), it just doesn't WAIT for it
       before showing something.
     - Accuracy circle is drawn in real meters (Leaflet's L.circle takes
       radius in meters directly), so it honestly shrinks as the fix
       improves rather than being a fixed decorative size.

   Runs only while the location popup is open: starts on openLocModal(),
   stops (clears the GPS watch) on close, so it isn't burning
   battery/GPS in the background the rest of the time.

   Exposes window.PD_LIVE_LOCATION = { lat, lng, accuracy, updatedAt } so
   order placement (script.js) can use the freshest fix as a fallback
   when a saved address has no coordinates yet.
========================================================= */

const FIRST_FIX_TIMEOUT_MS = 6000; // don't make them wait past ~6s for even a rough first dot
const GOOD_ENOUGH_ACCURACY_M = 15; // once we're this good, stop bothering to re-zoom aggressively

let map = null;
let dotMarker = null;
let accuracyCircle = null;
let watchId = null;
let addressDebounce = null;
let hasFirstFix = false;

function el(id) { return document.getElementById(id); }

function accuracyBadgeClass(acc) {
  if (acc <= 20) return 'good';
  if (acc <= 75) return 'ok';
  return 'poor';
}

// Lightweight reverse geocode (OpenStreetMap Nominatim - same free service
// script.js already uses for the checkout address picker), scoped to this
// module so it works standalone.
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('reverse geocode failed');
    const data = await res.json();
    const a = data.address || {};
    const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.county || '';
    const city = a.city || a.town || a.municipality || a.state_district || '';
    return [area, city].filter(Boolean).join(', ') || data.display_name || null;
  } catch (e) {
    return null;
  }
}

function buildDotIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="live-loc-dot-icon"><div class="pulse"></div><div class="core"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function ensureMap() {
  if (map) return map;
  const mapEl = el('liveLocMap');
  if (!mapEl || typeof L === 'undefined') return null;

  map = L.map(mapEl, {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    touchZoom: true,
    doubleClickZoom: false,
    tap: false
  }).setView([20.5937, 78.9629], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  return map;
}

function drawFix(lat, lng, accuracy) {
  const m = ensureMap();
  if (!m) return;
  const latlng = [lat, lng];

  if (!accuracyCircle) {
    accuracyCircle = L.circle(latlng, {
      radius: accuracy, color: '#4285F4', weight: 1, fillColor: '#4285F4', fillOpacity: 0.12
    }).addTo(m);
  } else {
    accuracyCircle.setLatLng(latlng);
    accuracyCircle.setRadius(accuracy);
  }

  if (!dotMarker) {
    dotMarker = L.marker(latlng, { icon: buildDotIcon(), zIndexOffset: 1000 }).addTo(m);
  } else {
    dotMarker.setLatLng(latlng);
  }

  // Zoom straight to a usable street-level view on the very first fix
  // (no slow city->street animation), then just re-center quietly as it
  // improves.
  const targetZoom = accuracy <= GOOD_ENOUGH_ACCURACY_M ? 18 : accuracy <= 100 ? 16 : 14;
  if (!hasFirstFix) {
    m.setView(latlng, targetZoom, { animate: false });
  } else {
    m.setView(latlng, Math.max(m.getZoom(), targetZoom), { animate: true });
  }

  // Popup can be sized 0x0 if it just became visible - force Leaflet to
  // recalc so tiles actually render instead of showing a gray box.
  requestAnimationFrame(() => m.invalidateSize());
}

function setOverlay(show, text) {
  const overlay = el('liveLocOverlay');
  const overlayText = el('liveLocOverlayText');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
  if (overlayText && text) overlayText.textContent = text;
}

function setAccuracyBadge(accuracy) {
  const accEl = el('liveLocAccuracy');
  if (!accEl) return;
  if (typeof accuracy === 'number') {
    accEl.style.display = 'inline-block';
    accEl.className = `live-loc-accuracy ${accuracyBadgeClass(accuracy)}`;
    accEl.textContent = `±${Math.round(accuracy)}m`;
  } else {
    accEl.style.display = 'none';
  }
}

function onFix(pos, forceAccept) {
  const { latitude, longitude, accuracy } = pos.coords;

  const ageMs = Date.now() - pos.timestamp;
  const isStale = !forceAccept && ageMs > 10000;
  const isTooRough = !forceAccept && !hasFirstFix && accuracy > 500;

  if (isStale || isTooRough) {
    setOverlay(true, isStale
      ? 'Ignoring an old cached position — getting a fresh live fix…'
      : `Refining your location… (±${Math.round(accuracy)}m so far)`);
    return; // don't draw/commit this one - wait for the next callback
  }

  window.PD_LOC_PERMISSION = 'granted';
  window.PD_LIVE_LOCATION = { lat: latitude, lng: longitude, accuracy, updatedAt: Date.now() };
  window.dispatchEvent(new CustomEvent('pd:live-location', { detail: window.PD_LIVE_LOCATION }));

  drawFix(latitude, longitude, accuracy);
  setOverlay(false); // first genuinely fresh fix in hand - drop the "getting location" cover
  setAccuracyBadge(accuracy);
  hasFirstFix = true;

  // Reverse-geocode a human-readable label, debounced so rapid GPS ticks
  // don't spam Nominatim.
  clearTimeout(addressDebounce);
  addressDebounce = setTimeout(async () => {
    const label = await reverseGeocode(latitude, longitude);
    const labelEl = el('locCurrentLabel');
    if (label && labelEl) labelEl.textContent = label;
  }, 500);
}

function onError(err) {
  if (err && err.code === 1) window.PD_LOC_PERMISSION = 'denied';
  if (hasFirstFix) return; // already have a dot on screen - a later timeout/error shouldn't wipe it
  let msg = 'Could not get your exact location';
  if (err && err.code === 1) msg = 'Location permission denied — enable it in browser/site settings';
  else if (err && err.code === 2) msg = 'Location unavailable — check GPS/network and try again';
  else if (err && err.code === 3) msg = 'Taking longer than usual — still trying…';
  setOverlay(true, msg);
}

export function startWatching() {
  if (!navigator.geolocation) {
    setOverlay(true, 'Geolocation is not supported on this device');
    return;
  }
  if (watchId !== null) return; // already watching

  hasFirstFix = false;
  let bestSoFar = null; // fallback if every fix keeps getting rejected as stale/rough
  ensureMap();
  setOverlay(true, 'Getting your exact location…');

  // ONE geolocation engine only (watchPosition). Previously this fired
  // BOTH getCurrentPosition and watchPosition at once "to be safe" -
  // that's actually what caused two competing fixes to race each other.
  // watchPosition alone already delivers its first callback immediately
  // on virtually every browser, and is also what triggers the native
  // permission prompt the first time it's called.
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!bestSoFar || pos.coords.accuracy < bestSoFar.coords.accuracy) bestSoFar = pos;
      onFix(pos, false);
    },
    onError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: FIRST_FIX_TIMEOUT_MS }
  );

  // Safety valve: if every single fix so far has been rejected as stale
  // or too rough (rare, but possible on a phone with poor signal), stop
  // waiting after a few seconds and just show the best one we've seen
  // rather than leaving the popup stuck on "Getting your location...".
  setTimeout(() => {
    if (hasFirstFix || !bestSoFar) return;
    onFix(bestSoFar, true); // forceAccept: show it even if stale/rough rather than nothing
  }, 8000);
}

export function stopWatching() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  clearTimeout(addressDebounce);
}

// Called once from app-init.js. Doesn't start GPS itself - script.js's
// openLocModal()/closeLocModal() call startWatching()/stopWatching() so
// tracking only runs while the popup is actually open.
export function initLiveLocation() {
  window.PD_LIVE_LOC = { start: startWatching, stop: stopWatching };
}

export function getLiveLocation() {
  return window.PD_LIVE_LOCATION || null;
}
