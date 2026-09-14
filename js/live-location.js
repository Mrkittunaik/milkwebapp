/* =========================================================
   LIVE DELIVERY LOCATION
   ---------------------------------------------------------
   High-accuracy browser location for delivery address picker.

   Flow:
   1. Ask browser for high-accuracy location.
   2. Start continuous watchPosition().
   3. Accept fresh fixes.
   4. Prefer better accuracy as GPS improves.
   5. Show accuracy circle in real meters.
   6. Keep latest/best location available globally.
   7. Reverse-geocode the best location.
   8. Stop GPS when popup closes.

   IMPORTANT:
   Browser GPS accuracy depends on the customer's device,
   operating system, browser, GPS visibility and permissions.
   The website cannot force a specific accuracy such as 5m.
========================================================= */

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 60000
};

// Accuracy we consider excellent.
const EXCELLENT_ACCURACY = 20;

// Accuracy at which we stop aggressively trying to improve.
const GOOD_ACCURACY = 30;

// Ignore extremely bad fixes.
const MAX_USEFUL_ACCURACY = 150;

// Don't use positions older than this.
const MAX_POSITION_AGE = 15000;

// GPS watch.
let watchId = null;

// Leaflet objects.
let map = null;
let dotMarker = null;
let accuracyCircle = null;

// Best location received so far.
let bestPosition = null;

// Latest location received.
let latestPosition = null;

let addressDebounce = null;
let locationStartedAt = 0;


/* =========================================================
   HELPERS
========================================================= */

function el(id) {
  return document.getElementById(id);
}


/* =========================================================
   ACCURACY LABEL
========================================================= */

function getAccuracyLabel(accuracy) {

  if (accuracy <= 10) {
    return "Very accurate";
  }

  if (accuracy <= 20) {
    return "Excellent accuracy";
  }

  if (accuracy <= 30) {
    return "Good accuracy";
  }

  if (accuracy <= 50) {
    return "Improving accuracy";
  }

  if (accuracy <= 100) {
    return "Approximate location";
  }

  return "Low accuracy";
}


/* =========================================================
   ACCURACY BADGE
========================================================= */

function setAccuracyBadge(accuracy) {

  const accEl = el("liveLocAccuracy");

  if (!accEl) return;

  if (typeof accuracy !== "number") {
    accEl.style.display = "none";
    return;
  }

  accEl.style.display = "inline-block";

  accEl.className = "live-loc-accuracy";

  if (accuracy <= 20) {
    accEl.classList.add("good");
  } else if (accuracy <= 50) {
    accEl.classList.add("ok");
  } else {
    accEl.classList.add("poor");
  }

  accEl.textContent = `±${Math.round(accuracy)}m`;
}


/* =========================================================
   OVERLAY
========================================================= */

function setOverlay(show, text = "") {

  const overlay = el("liveLocOverlay");
  const overlayText = el("liveLocOverlayText");

  if (!overlay) return;

  overlay.classList.toggle("hidden", !show);

  if (overlayText && text) {
    overlayText.textContent = text;
  }
}


/* =========================================================
   LEAFLET DOT
========================================================= */

function buildDotIcon() {

  return L.divIcon({
    className: "",
    html: `
      <div class="live-loc-dot-icon">
        <div class="pulse"></div>
        <div class="core"></div>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}


/* =========================================================
   CREATE MAP
========================================================= */

function ensureMap() {

  if (map) {
    return map;
  }

  const mapEl = el("liveLocMap");

  if (!mapEl) {
    console.error("liveLocMap element not found");
    return null;
  }

  if (typeof L === "undefined") {
    console.error("Leaflet is not loaded");
    return null;
  }

  map = L.map(mapEl, {
    zoomControl: false,
    attributionControl: true,

    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true,

    zoomAnimation: true
  });

  map.setView([20.5937, 78.9629], 5);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);

  return map;
}


/* =========================================================
   DRAW USER LOCATION
========================================================= */

function drawLocation(lat, lng, accuracy, firstFix = false) {

  const m = ensureMap();

  if (!m) return;

  const latlng = [lat, lng];

  /* -----------------------------------------
     ACCURACY CIRCLE
  ----------------------------------------- */

  if (!accuracyCircle) {

    accuracyCircle = L.circle(latlng, {
      radius: accuracy,

      color: "#4285F4",
      weight: 2,

      fillColor: "#4285F4",
      fillOpacity: 0.12
    }).addTo(m);

  } else {

    accuracyCircle.setLatLng(latlng);
    accuracyCircle.setRadius(accuracy);
  }


  /* -----------------------------------------
     LOCATION DOT
  ----------------------------------------- */

  if (!dotMarker) {

    dotMarker = L.marker(latlng, {
      icon: buildDotIcon(),
      zIndexOffset: 1000
    }).addTo(m);

  } else {

    dotMarker.setLatLng(latlng);
  }


  /* -----------------------------------------
     ZOOM
  ----------------------------------------- */

  let zoom = 16;

  if (accuracy <= 20) {
    zoom = 18;
  } else if (accuracy <= 50) {
    zoom = 17;
  } else if (accuracy <= 100) {
    zoom = 16;
  }

  if (firstFix) {

    m.setView(latlng, zoom, {
      animate: false
    });

  } else {

    // Keep the map centered on the user while tracking.
    m.setView(latlng, Math.max(m.getZoom(), zoom), {
      animate: true
    });
  }


  requestAnimationFrame(() => {
    m.invalidateSize();
  });
}


/* =========================================================
   DETERMINE WHETHER THIS IS A BETTER POSITION
========================================================= */

function isBetterPosition(position) {

  if (!bestPosition) {
    return true;
  }

  const newAccuracy = position.coords.accuracy;
  const oldAccuracy = bestPosition.coords.accuracy;

  /*
   * A newer position that is significantly more accurate
   * replaces the old position.
   */

  if (newAccuracy < oldAccuracy - 3) {
    return true;
  }

  /*
   * If accuracy is almost the same, prefer the newer fix.
   */

  if (
    Math.abs(newAccuracy - oldAccuracy) <= 3 &&
    position.timestamp > bestPosition.timestamp
  ) {
    return true;
  }

  return false;
}


/* =========================================================
   PROCESS LOCATION
========================================================= */

function onLocation(position) {

  const coords = position.coords;

  const latitude = coords.latitude;
  const longitude = coords.longitude;
  const accuracy = coords.accuracy;

  const age = Date.now() - position.timestamp;

  console.log("GPS FIX:", {
    latitude,
    longitude,
    accuracy,
    age
  });


  /* -----------------------------------------
     BASIC VALIDATION
  ----------------------------------------- */

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy)
  ) {
    console.warn("Invalid GPS position");
    return;
  }


  /*
   * Ignore stale locations.
   */

  if (age > MAX_POSITION_AGE) {

    console.log("Ignoring stale location:", age);

    setOverlay(
      true,
      "Getting a fresh GPS location…"
    );

    return;
  }


  /*
   * Ignore extremely inaccurate positions.
   *
   * IMPORTANT:
   * We do NOT require <=40m anymore.
   *
   * GPS can start at 80m and improve to 10m.
   */

  if (accuracy > MAX_USEFUL_ACCURACY) {

    console.log(
      "Location too inaccurate:",
      accuracy
    );

    setOverlay(
      true,
      `Improving GPS accuracy… ±${Math.round(accuracy)}m`
    );

    return;
  }


  /* -----------------------------------------
     SAVE LATEST FIX
  ----------------------------------------- */

  latestPosition = position;


  /* -----------------------------------------
     CHECK BEST FIX
  ----------------------------------------- */

  const firstFix = bestPosition === null;

  if (isBetterPosition(position)) {

    bestPosition = position;

    const locationData = {
      lat: latitude,
      lng: longitude,
      accuracy: accuracy,
      updatedAt: Date.now(),
      timestamp: position.timestamp
    };

    /*
     * Global location object.
     */

    window.PD_LIVE_LOCATION = locationData;

    window.PD_LOC_PERMISSION = "granted";

    /*
     * Notify the rest of your website.
     */

    window.dispatchEvent(
      new CustomEvent(
        "pd:live-location",
        {
          detail: locationData
        }
      )
    );


    /* -----------------------------------------
       DRAW
    ----------------------------------------- */

    drawLocation(
      latitude,
      longitude,
      accuracy,
      firstFix
    );


    /* -----------------------------------------
       UI
    ----------------------------------------- */

    setAccuracyBadge(accuracy);

    setOverlay(
      false
    );


    /*
     * Show accuracy information.
     */

    const label = el("locAccuracyText");

    if (label) {

      label.textContent =
        `${getAccuracyLabel(accuracy)} · ±${Math.round(accuracy)}m`;
    }


    /* -----------------------------------------
       REVERSE GEOCODE
    ----------------------------------------- */

    clearTimeout(addressDebounce);

    addressDebounce = setTimeout(
      () => {

        reverseGeocode(
          latitude,
          longitude
        );

      },
      700
    );
  }


  /*
   * Excellent accuracy achieved.
   */

  if (accuracy <= EXCELLENT_ACCURACY) {

    setOverlay(false);

    console.log(
      "Excellent GPS accuracy:",
      accuracy
    );
  }
}


/* =========================================================
   REVERSE GEOCODING
========================================================= */

async function reverseGeocode(lat, lng) {

  try {

    const url =
      "https://nominatim.openstreetmap.org/reverse" +
      `?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lng)}` +
      `&zoom=18` +
      `&addressdetails=1`;

    const response = await fetch(
      url,
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Reverse geocoding failed"
      );
    }

    const data = await response.json();

    const address = data.address || {};

    const area =
      address.suburb ||
      address.neighbourhood ||
      address.quarter ||
      address.city_district ||
      "";

    const city =
      address.city ||
      address.town ||
      address.municipality ||
      address.state_district ||
      "";

    const state =
      address.state ||
      "";

    const label =
      [
        area,
        city,
        state
      ]
      .filter(Boolean)
      .join(", ");


    const labelEl =
      el("locCurrentLabel");

    if (labelEl) {

      labelEl.textContent =
        label ||
        data.display_name ||
        "Current location";
    }


    /*
     * Keep full address information available
     * for checkout/order placement.
     */

    window.PD_LIVE_ADDRESS = {
      displayName:
        data.display_name || label || "",

      area,
      city,
      state,

      latitude: lat,
      longitude: lng
    };


    window.dispatchEvent(
      new CustomEvent(
        "pd:live-address",
        {
          detail:
            window.PD_LIVE_ADDRESS
        }
      )
    );


    return data;

  } catch (error) {

    console.warn(
      "Reverse geocoding failed:",
      error
    );

    return null;
  }
}


/* =========================================================
   LOCATION ERROR
========================================================= */

function onLocationError(error) {

  console.error(
    "Geolocation error:",
    error
  );


  /*
   * Permission denied.
   */

  if (error.code === 1) {

    window.PD_LOC_PERMISSION = "denied";

    setOverlay(
      true,
      "Location permission denied. Please allow location access in your browser settings."
    );

    return;
  }


  /*
   * Position unavailable.
   */

  if (error.code === 2) {

    setOverlay(
      true,
      "GPS location unavailable. Please turn on Location Services and try again."
    );

    return;
  }


  /*
   * Timeout.
   *
   * Don't treat this as permanent failure.
   * The watch can continue receiving future fixes.
   */

  if (error.code === 3) {

    setOverlay(
      true,
      "GPS is taking longer than usual. Searching for a better location…"
    );

    return;
  }


  setOverlay(
    true,
    "Unable to get your current location."
  );
}


/* =========================================================
   START WATCHING
========================================================= */

export function startWatching() {

  if (!navigator.geolocation) {

    setOverlay(
      true,
      "Your browser does not support location services."
    );

    return;
  }


  /*
   * Don't start twice.
   */

  if (watchId !== null) {

    console.log(
      "Location watch already running"
    );

    return;
  }


  /*
   * Reset session state.
   */

  bestPosition = null;
  latestPosition = null;

  locationStartedAt = Date.now();

  window.PD_LIVE_LOCATION = null;


  setOverlay(
    true,
    "Getting your precise location…"
  );


  /*
   * Make sure map exists.
   */

  ensureMap();


  /*
   * IMPORTANT:
   *
   * watchPosition is used as the single GPS engine.
   *
   * enableHighAccuracy requests GPS-level accuracy.
   */

  watchId =
    navigator.geolocation.watchPosition(
      onLocation,
      onLocationError,
      LOCATION_OPTIONS
    );


  console.log(
    "High-accuracy location tracking started"
  );
}


/* =========================================================
   STOP WATCHING
========================================================= */

export function stopWatching() {

  if (watchId !== null) {

    navigator.geolocation.clearWatch(
      watchId
    );

    watchId = null;
  }


  clearTimeout(
    addressDebounce
  );


  console.log(
    "Location tracking stopped"
  );
}


/* =========================================================
   GET CURRENT BEST LOCATION
========================================================= */

export function getLiveLocation() {

  return (
    window.PD_LIVE_LOCATION ||
    null
  );
}


/* =========================================================
   INITIALIZE GLOBAL API
========================================================= */

export function initLiveLocation() {

  window.PD_LIVE_LOC = {

    start: startWatching,

    stop: stopWatching,

    get: getLiveLocation
  };
}


/* =========================================================
   OPTIONAL:
   MANUALLY REQUEST A FRESH LOCATION
========================================================= */

export function requestFreshLocation() {

  if (!navigator.geolocation) {
    return;
  }


  navigator.geolocation.getCurrentPosition(
    onLocation,
    onLocationError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 60000
    }
  );
}
