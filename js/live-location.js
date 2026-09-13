/* =========================================================
   LIVE LOCATION (homepage GPS dot)
   -------------------------------------------------------------------------
   Shows the customer's EXACT real-time position on a small live map on
   the home screen, the way Zomato/Swiggy/Google Maps show "you are here":

     - Uses navigator.geolocation.watchPosition (continuous), not a single
       getCurrentPosition call, so the fix keeps refining after the first
       (often rough, Wi-Fi/cell-tower based) reading.
     - enableHighAccuracy:true asks the device for real GPS chip data, not
       just network-based approximation.
     - Draws a real accuracy circle in METERS (not a fixed pixel size) so
       what's on screen honestly represents current GPS uncertainty - a
       50m accuracy circle actually covers 50m on the map regardless of
       zoom, and visibly shrinks as accuracy improves toward the ~1-5m a
       good outdoor GPS fix gives.
     - The dot itself is a pulsing "blue dot" exactly like Google Maps'
       own live-location marker.

   Exposes window.PD_LIVE_LOCATION = { lat, lng, accuracy, updatedAt } so
   order placement (script.js / orders.js) can use the freshest possible
   fix as a fallback if a saved address has no coordinates yet.
========================================================= */

const TARGET_ACCURACY_M = 15;   // "GPS-grade" - stop treating the fix as "still narrowing" once this good
const MIN_ZOOM_FOR_DOT = 17;

let map = null;
let dotMarker = null;
let accuracyCircle = null;
let watchId = null;
let bestAccuracySoFar = Infinity;
let addressDebounce = null;

function el(id) { return document.getElementById(id); }

function accuracyBadgeClass(acc) {
  if (acc <= 20) return 'good';
  if (acc <= 75) return 'ok';
  return 'poor';
}

// Lightweight reverse geocode (OpenStreetMap Nominatim - same free service
// script.js already uses for the checkout address picker), scoped to this
// module so it works standalone without depending on script.js internals.
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
    className: '', // avoid Leaflet's default marker box/shadow
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
  }).setView([20.5937, 78.9629], 5); // default: India, until first fix arrives

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  return map;
}

// Converts a metre radius to something Leaflet's L.circle already handles
// natively (it takes radius in meters directly) - kept as a named helper
// only so the "why meters, not pixels" reasoning has one place to live.
function drawFix(lat, lng, accuracy) {
  const m = ensureMap();
  if (!m) return;

  const latlng = [lat, lng];

  if (!accuracyCircle) {
    accuracyCircle = L.circle(latlng, {
      radius: accuracy,
      color: '#4285F4',
      weight: 1,
      fillColor: '#4285F4',
      fillOpacity: 0.12
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

  // Zoom in as the fix improves so the exact dot (not a wide city view) is
  // what's on screen once GPS has locked on - mirrors how Google Maps'
  // blue dot snaps to a tight zoom once it gets a real fix.
  const targetZoom = accuracy <= TARGET_ACCURACY_M ? 18 : accuracy <= 75 ? 16 : 14;
  m.setView(latlng, Math.max(targetZoom, MIN_ZOOM_FOR_DOT - 2), { animate: true });
}

function setOverlay({ show, spinning = true, text }) {
  const overlay = el('liveLocOverlay');
  const overlayText = el('liveLocOverlayText');
  const enableBtn = el('liveLocEnableBtn');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
  overlay.classList.toggle('no-spin', !spinning);
  if (overlayText && text) overlayText.textContent = text;
  if (enableBtn) enableBtn.style.display = spinning ? 'none' : (show ? 'inline-block' : 'none');
}

function updateInfoPanel({ label, sub, accuracy }) {
  const labelEl = el('liveLocLabel');
  const subEl = el('liveLocSub');
  const accEl = el('liveLocAccuracy');
  if (labelEl && label) labelEl.textContent = label;
  if (subEl && sub !== undefined) subEl.textContent = sub;
  if (accEl) {
    if (typeof accuracy === 'number') {
      accEl.style.display = 'inline-block';
      accEl.className = `live-loc-accuracy ${accuracyBadgeClass(accuracy)}`;
      accEl.textContent = `±${Math.round(accuracy)}m`;
    } else {
      accEl.style.display = 'none';
    }
  }
}

function onFix(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  window.PD_LIVE_LOCATION = {
    lat: latitude,
    lng: longitude,
    accuracy,
    updatedAt: Date.now()
  };
  window.dispatchEvent(new CustomEvent('pd:live-location', { detail: window.PD_LIVE_LOCATION }));

  drawFix(latitude, longitude, accuracy);

  const stillNarrowing = accuracy > TARGET_ACCURACY_M && accuracy < bestAccuracySoFar + 5;
  bestAccuracySoFar = Math.min(bestAccuracySoFar, accuracy);

  setOverlay({
    show: stillNarrowing,
    spinning: true,
    text: `Getting your exact location… (±${Math.round(accuracy)}m)`
  });

  updateInfoPanel({
    label: accuracy <= TARGET_ACCURACY_M ? 'You are here' : 'Locking your exact position…',
    sub: 'Live GPS · updates automatically',
    accuracy
  });

  // Reverse-geocode a human-readable label, but don't spam Nominatim on
  // every single high-frequency GPS tick - debounce to once per fix burst.
  clearTimeout(addressDebounce);
  addressDebounce = setTimeout(async () => {
    const label = await reverseGeocode(latitude, longitude);
    if (label) updateInfoPanel({ label, sub: `Live GPS · ±${Math.round(accuracy)}m`, accuracy });
  }, 600);
}

function onError(err) {
  let msg = 'Could not get your exact location';
  if (err && err.code === 1) msg = 'Location permission denied — enable it in browser/site settings';
  else if (err && err.code === 2) msg = 'Location unavailable — check GPS/network and try again';
  else if (err && err.code === 3) msg = 'Location request timed out — try again';

  setOverlay({ show: true, spinning: false, text: msg });
  updateInfoPanel({ label: 'Location unavailable', sub: 'Tap "Enable exact location" to retry', accuracy: null });
}

function startWatching() {
  if (!navigator.geolocation) {
    setOverlay({ show: true, spinning: false, text: 'Geolocation is not supported on this device' });
    return;
  }
  if (watchId !== null) return; // already watching

  bestAccuracySoFar = Infinity;
  setOverlay({ show: true, spinning: true, text: 'Getting your exact location…' });

  watchId = navigator.geolocation.watchPosition(onFix, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,   // never reuse a cached/stale fix - always the freshest reading
    timeout: 20000
  });
}

function stopWatching() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function initLiveLocation() {
  const card = el('liveLocCard');
  if (!card) return;

  ensureMap();

  const enableBtn = el('liveLocEnableBtn');
  if (enableBtn) enableBtn.addEventListener('click', startWatching);

  // If permission is already granted from an earlier visit, start tracking
  // immediately without waiting for a tap (mirrors script.js's existing
  // window.PD_LOC_PERMISSION check for the checkout flow).
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (status.state === 'granted') startWatching();
      status.onchange = () => {
        if (status.state === 'granted') startWatching();
      };
    }).catch(() => {});
  }

  // Pause the GPS watch when the tab isn't visible (saves battery/data),
  // resume when it's back - the dot picks up live again instantly since
  // maximumAge:0 always asks for a fresh fix.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopWatching();
    else if (window.PD_LIVE_LOCATION) startWatching();
  });

  // Leaflet needs a nudge to recalc size if its container was hidden
  // (display:none) at the moment it was created, e.g. app starts on a
  // different screen than Home.
  const ro = new ResizeObserver(() => { if (map) map.invalidateSize(); });
  ro.observe(card);
}

export function getLiveLocation() {
  return window.PD_LIVE_LOCATION || null;
}
