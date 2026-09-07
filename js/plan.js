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

let allPlans = [];
let onAddPlan = null; // injected by app-init.js, same pattern as products' onAdd

const DROP_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13Z"/></svg>';

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
        <button class="pkg-btn" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}">Subscribe</button>
      </div>
    </div>`;
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

  rail.querySelectorAll('.pkg-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { id, name, price } = btn.dataset;
      if (typeof onAddPlan === 'function') onAddPlan({ id, name, price: Number(price) }, btn);
    });
  });
}

async function loadPlans() {
  try {
    allPlans = await plansApi.list();
    if (!Array.isArray(allPlans) || !allPlans.length) allPlans = DEMO_PLANS;
    renderRail();
  } catch (err) {
    console.warn('[plans] backend not reachable yet, showing demo preview:', err.message);
    allPlans = DEMO_PLANS;
    renderRail();
  }
}

// Called once from app-init.js after DOM is ready.
export function initPlans({ onAdd }) {
  onAddPlan = onAdd;
  loadPlans();

  onSocket('catalog:changed', ({ kind }) => {
    if (kind === 'plan') loadPlans();
  });
}

export function getPlanById(id) {
  return allPlans.find(p => p._id === id);
}
