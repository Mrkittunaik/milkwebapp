/* =========================================================
   HOME BANNERS
   Replaces the old hardcoded 3-card promo rail with real
   banners from the admin panel. Each banner is IMAGE-first:
   if the admin uploaded an image, that image fills the card
   edge-to-edge (no title/subtitle text drawn on top of it -
   any text is already baked into the image itself). Only
   banners with no image fall back to the color+title+subtitle
   card style the site used before, so admins who haven't
   uploaded an image yet still see something reasonable.

   PLACEHOLDER: when the admin hasn't added ANY banner yet, a
   built-in coded (SVG) placeholder is shown instead of leaving
   the section blank - no image file involved, it's drawn in
   code. The instant the admin adds a real banner, the next
   catalog:changed('banner') fetch replaces it automatically.

   A broken/failed image NEVER stays broken on screen: onerror
   swaps that single card over to the color+text fallback
   instantly, so a bad upload never shows a broken-image icon
   to a live visitor.

   Live updates: admin adds/edits/reorders/removes/deletes a
   banner -> backend emits catalog:changed{kind:'banner'} ->
   this module re-fetches and re-renders instantly, no reload.
========================================================= */

import { bannersApi, API_BASE } from './api.js';
import { onSocket } from './socket.js';

const CACHE_KEY = 'pd_cache_banners';

let banners = [];
let railIdx = 0;
let autoTimer = null;
let paused = false;

function loadCachedBanners() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveCachedBanners(list) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
}

// Coded (inline SVG) placeholder - shown ONLY when the admin has zero
// banners saved. Nothing here is a raster image file, so there's no
// broken-image risk, and it disappears by itself the moment a real
// banner exists (renderBanners() just stops calling this).
function placeholderCardHtml() {
  return `
    <div class="promo-card promo-placeholder">
      <svg class="promo-placeholder-svg" viewBox="0 0 400 132" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="phGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#FFE38A"/>
            <stop offset="1" stop-color="#FDC202"/>
          </linearGradient>
        </defs>
        <rect width="400" height="132" fill="url(#phGrad)"/>
        <circle cx="382" cy="122" r="60" fill="#ffffff" opacity="0.18"/>
        <circle cx="360" cy="10" r="34" fill="#ffffff" opacity="0.15"/>
      </svg>
      <div class="promo-copy">
        <div class="promo-eyebrow">Pakka Doodhwala</div>
        <div class="promo-title">Add your first banner<br>from the admin panel</div>
        <div class="promo-sub">This placeholder disappears automatically</div>
      </div>
    </div>`;
}

function resolveImageUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`;
}

function bannerCardHtml(b, i) {
  const img = resolveImageUrl(b.image);
  const bg = b.color || '#FDC202';

  if (img) {
    // Image-type banner: the image IS the banner, full-bleed, no overlay
    // text. onerror flips this exact card to the text fallback below
    // without touching any other card or re-fetching anything.
    return `
      <div class="promo-card promo-img" data-i="${i}" style="background:${bg};">
        <img src="${img}" alt="${b.title || 'Offer'}" loading="${i === 0 ? 'eager' : 'lazy'}"
             onerror="this.closest('.promo-card').classList.add('promo-fallback'); this.remove();">
        <div class="promo-copy promo-copy-fallback">
          <div class="promo-title">${b.title || ''}</div>
          ${b.subtitle ? `<div class="promo-sub">${b.subtitle}</div>` : ''}
        </div>
      </div>`;
  }

  // Text-type banner (no image uploaded): color card with title/subtitle.
  return `
    <div class="promo-card promo-fallback" data-i="${i}" style="background:${bg};">
      <div class="promo-blob"></div><div class="promo-blob2"></div>
      <div class="promo-copy">
        <div class="promo-title">${b.title || ''}</div>
        ${b.subtitle ? `<div class="promo-sub">${b.subtitle}</div>` : ''}
      </div>
    </div>`;
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

function startAuto(rail, dots) {
  stopAuto();
  const count = banners.length;
  if (count < 2) return;
  autoTimer = setInterval(() => {
    if (paused) return;
    railIdx = (railIdx + 1) % count;
    rail.scrollTo({ left: rail.clientWidth * railIdx, behavior: 'smooth' });
    dots.forEach((d, i) => d.classList.toggle('active', i === railIdx));
  }, 3200);
}

function renderBanners() {
  const outer = document.querySelector('.promo-outer');
  const rail = document.getElementById('promoRail');
  const dotsWrap = document.getElementById('promoDots');
  if (!outer || !rail || !dotsWrap) return;

  outer.style.display = '';

  if (!banners.length) {
    // No real banners yet -> show the coded placeholder, no dots/autoscroll.
    railIdx = 0;
    rail.innerHTML = placeholderCardHtml();
    dotsWrap.innerHTML = '';
    rail.scrollTo({ left: 0 });
    stopAuto();
    return;
  }

  railIdx = 0;
  rail.innerHTML = banners.map(bannerCardHtml).join('');
  dotsWrap.innerHTML = banners.map((_, i) => `<div class="promo-dot${i === 0 ? ' active' : ''}"></div>`).join('');
  rail.scrollTo({ left: 0 });

  const dots = dotsWrap.querySelectorAll('.promo-dot');

  // Clicking a banner (that has a link target) jumps to that section.
  rail.querySelectorAll('.promo-card').forEach((card, i) => {
    const link = banners[i] && banners[i].link;
    if (!link || link === 'none') return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      if (typeof window.gotoScreen === 'function') window.gotoScreen(link);
    });
  });

  startAuto(rail, dots);
}

async function loadBanners() {
  try {
    banners = await bannersApi.list();
    saveCachedBanners(banners);
    renderBanners();
  } catch (err) {
    console.error('[banners] failed to load:', err.message);
    // Couldn't reach the backend - keep whatever's already showing
    // (cached banners) instead of wiping it back to the placeholder.
    if (!banners.length) renderBanners();
  }
}

export function initBanners() {
  const rail = document.getElementById('promoRail');
  if (!rail) return;

  rail.addEventListener('touchstart', () => { paused = true; }, { passive: true });
  rail.addEventListener('touchend', () => setTimeout(() => { paused = false; }, 3000));
  rail.addEventListener('mousedown', () => { paused = true; });
  rail.addEventListener('mouseup', () => setTimeout(() => { paused = false; }, 3000));

  // Show last-known banners immediately instead of the placeholder while
  // the network call is in flight, then loadBanners() refreshes silently.
  const cached = loadCachedBanners();
  if (cached.length) {
    banners = cached;
    renderBanners();
  }

  loadBanners();

  // Live update: admin adds/edits/reorders/deletes a banner -> re-fetch
  // and re-render instantly, no reload.
  onSocket('catalog:changed', ({ kind }) => {
    if (kind === 'banner') loadBanners();
  });
}
