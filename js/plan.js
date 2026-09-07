/* =========================================================
   PLANS / SUBSCRIPTION PACKAGES
   Renders the horizontal-scroll "Milk Packages" rail on the
   home screen from real data fetched from the backend, and
   keeps it live: whenever the admin adds/edits/removes a plan
   the backend emits "catalog:changed" (kind: "plan") and this
   file re-renders instantly - no reload, same pattern as
   products.js.

   Expected plan shape from the backend / admin panel:
   {
     _id, name, tag, desc, price, period,   // period: "day" | "month" | "week" ...
     image,        // full or relative URL - shown as the top-half photo
     featured      // true -> dark "most popular" styling
   }
========================================================= */

import { plansApi, API_BASE } from './api.js';
import { onSocket } from './socket.js';

const CACHE_KEY = 'pd_cache_plans';

let allPlans = [];
let onAddPlan = null; // injected by app-init.js, same pattern as products' onAdd

function loadCachedPlans() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveCachedPlans(list) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
}

const DROP_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13Z"/></svg>';
const CHECK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

// Tracks which plan ids are currently showing the brief "Added ✓" pop,
// right after tapping Subscribe, before it settles into the persistent
// "Subscribed" state (same pattern as products.js's justAddedIds).
const justAddedPlanIds = new Set();

// Once a plan has been added to the cart for this session/account, its
// card keeps showing "Subscribed" instead of "Subscribe" - it only goes
// back to "Subscribe" once it's actually removed from the cart (qty 0).
function planQtyInCart(planId) {
  const entry = window.cart && window.cart[planId];
  return entry ? entry.qty : 0;
}

function resolveImageUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`;
}

// ---- DEMO / PREVIEW DATA -------------------------------------------------
// Shown ONLY if the backend call fails (e.g. no backend running yet), purely
// so the design is visible while you build the API. The moment GET /api/plans
// responds for real, this is ignored automatically - delete this block
// (and the `catch` fallback below) once the backend is live.
const DEMO_PLANS = [
  {
    _id: 'demo-1', name: '1L Toned Milk', tag: 'Daily',
    desc: 'Delivered fresh every morning, glass bottle', price: 58, period: 'day',
    image: 'https://source.unsplash.com/600x450/?milk,bottle', featured: false
  },
  {
    _id: 'demo-2', name: 'Family Pack', tag: 'Most Popular',
    desc: '2L full-cream, weekly plan, 2 bottles/day', price: 899, period: 'month',
    image: 'https://source.unsplash.com/600x450/?milk,jug', featured: true
  },
  {
    _id: 'demo-3', name: 'Cow Ghee 500ml', tag: 'Weekly',
    desc: 'Pure desi cow ghee, hand-churned batch', price: 449, period: 'week',
    image: 'https://source.unsplash.com/600x450/?ghee,jar', featured: false
  },
  {
    _id: 'demo-4', name: 'Paneer Combo', tag: 'New',
    desc: '1kg fresh paneer + 1L curd, twice a week', price: 320, period: 'week',
    image: 'https://source.unsplash.com/600x450/?paneer,cheese', featured: false
  }
];
// ---------------------------------------------------------------------------

function thumbHtml(p) {
  const url = resolveImageUrl(p.image);
  if (url) {
    return `<img src="${url}" alt="${p.name}" loading="lazy" onerror="this.outerHTML='<div class=&quot;pkg-thumb-fallback&quot;>${DROP_ICON.replace(/"/g, '&quot;')}</div>'">`;
  }
  // No image set yet (admin hasn't uploaded one) - graceful fallback, never a broken image icon.
  return `<div class="pkg-thumb-fallback">${DROP_ICON}</div>`;
}

function planBtnHtml(p) {
  const inCart = planQtyInCart(p._id) > 0;

  if (justAddedPlanIds.has(p._id)) {
    return `<button class="pkg-btn pkg-btn-added" disabled data-id="${p._id}">${CHECK_ICON} Added</button>`;
  }
  if (inCart) {
    // Already subscribed - button is disabled so tapping it again can't add
    // a second/duplicate line for the same plan. It only becomes tappable
    // ("Subscribe") again once fully removed from the cart (qty 0).
    return `<button class="pkg-btn pkg-btn-subscribed" disabled data-id="${p._id}">${CHECK_ICON} Subscribed</button>`;
  }
  return `<button class="pkg-btn" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}">Subscribe</button>`;
}

function planCardHtml(p) {
  const period = p.period ? `<span>/ ${p.period}</span>` : '';
  return `
    <div class="pkg-card${p.featured ? ' featured' : ''}" data-id="${p._id}">
      <div class="pkg-thumb">
        ${thumbHtml(p)}
        ${p.tag ? `<div class="pkg-tag">${p.tag}</div>` : ''}
        <span class="pkg-drop">${DROP_ICON}</span>
      </div>
      <div class="pkg-body">
        <div class="pkg-name">${p.name}</div>
        <div class="pkg-desc">${p.desc || ''}</div>
        <div class="pkg-price">₹${p.price}${period}</div>
        ${planBtnHtml(p)}
      </div>
    </div>`;
}

// Shows the brief "Added ✓" pop right after Subscribe is tapped, then
// settles into the persistent "Subscribed" pill (same pattern as
// products.js's flashAdded).
function flashPlanAdded(planId) {
  justAddedPlanIds.add(planId);
  renderRail();
  setTimeout(() => {
    justAddedPlanIds.delete(planId);
    renderRail();
  }, 900);
}

function renderDots(rail, dotsEl, count) {
  if (!dotsEl) return;
  if (count <= 1) { dotsEl.innerHTML = ''; return; }
  dotsEl.innerHTML = Array.from({ length: count }, (_, i) => `<span${i === 0 ? ' class="active"' : ''}></span>`).join('');

  let debounce;
  rail.addEventListener('scroll', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const cardW = rail.firstElementChild ? rail.firstElementChild.getBoundingClientRect().width + 12 : 1;
      const idx = Math.round(rail.scrollLeft / cardW);
      dotsEl.querySelectorAll('span').forEach((d, di) => d.classList.toggle('active', di === idx));
    }, 100);
  }, { passive: true });
}

// Center-focused carousel: whichever card's center is closest to the
// rail's own center gets .is-active (big/full-opacity); every other
// card is the smaller/dimmed "peeking" side card. Runs continuously
// while scrolling (rAF-throttled) so the scale/opacity transition
// feels smooth as cards slide toward/away from the middle, not just
// a snap at the end.
function wireActiveCardTracking(rail) {
  let ticking = false;

  const updateActive = () => {
    ticking = false;
    const railRect = rail.getBoundingClientRect();
    const railCenter = railRect.left + railRect.width / 2;
    let closest = null;
    let closestDist = Infinity;

    rail.querySelectorAll('.pkg-card').forEach(card => {
      const r = card.getBoundingClientRect();
      const cardCenter = r.left + r.width / 2;
      const dist = Math.abs(cardCenter - railCenter);
      if (dist < closestDist) { closestDist = dist; closest = card; }
    });

    rail.querySelectorAll('.pkg-card').forEach(card => card.classList.toggle('is-active', card === closest));
  };

  rail.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateActive); }
  }, { passive: true });

  // Run once after render so the first (centered/first) card starts big.
  requestAnimationFrame(updateActive);
}

function renderRail() {
  const rail = document.getElementById('pkgRail');
  const dots = document.getElementById('pkgDots');
  if (!rail) return;

  if (!allPlans.length) {
    rail.innerHTML = `<div class="pkg-empty">No packages available right now.</div>`;
    if (dots) dots.innerHTML = '';
    return;
  }

  rail.innerHTML = allPlans.map(planCardHtml).join('');
  renderDots(rail, dots, allPlans.length);
  wireActiveCardTracking(rail);

  rail.querySelectorAll('.pkg-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { id, name, price } = btn.dataset;
      if (typeof onAddPlan === 'function') onAddPlan({ id, name, price: Number(price) }, btn);
      flashPlanAdded(id);
    });
  });
}

async function loadPlans() {
  try {
    allPlans = await plansApi.list();
    if (!Array.isArray(allPlans) || !allPlans.length) allPlans = DEMO_PLANS;
    else saveCachedPlans(allPlans);
    renderRail();
  } catch (err) {
    console.warn('[plans] backend not reachable yet, showing demo preview:', err.message);
    if (!allPlans.length) allPlans = DEMO_PLANS;
    renderRail();
  }
}

// Called once from app-init.js after DOM is ready.
export function initPlans({ onAdd }) {
  onAddPlan = onAdd;

  // Show last-known plans immediately (no blank rail while waiting on the
  // network), then loadPlans() below refreshes silently in the background.
  const cached = loadCachedPlans();
  if (cached.length) {
    allPlans = cached;
    renderRail();
  }

  loadPlans();

  onSocket('catalog:changed', ({ kind }) => {
    if (kind === 'plan') loadPlans();
  });

  // Cart changed from anywhere (cart screen -/+ , checkout clearing the
  // cart, etc.) -> re-render so a plan's card flips back to "Subscribe"
  // once it's actually removed, and chains onto products.js's own hook
  // instead of clobbering it if that ran first.
  const prevOnCartChanged = window.onCartChanged;
  window.onCartChanged = () => {
    if (typeof prevOnCartChanged === 'function') prevOnCartChanged();
    renderRail();
  };
}

export function getPlanById(id) {
  return allPlans.find(p => p._id === id);
}
