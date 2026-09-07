/* =========================================================
   PRODUCTS
   Replaces the old static HTML product cards with real data
   fetched from the backend, and keeps them live: whenever the
   admin edits/adds/removes/restocks a product, the backend
   emits "catalog:changed" and this file re-renders instantly -
   no page reload, matching the requirement that admin edits
   "fit properly and auto update without any reload".
========================================================= */

import { productsApi, API_BASE } from './api.js';
import { onSocket } from './socket.js';

const CACHE_KEY = 'pd_cache_products';

let allProducts = [];      // last fetched list, kept fresh by socket events
let currentFilter = 'all';
let onAddToCart = null;    // injected by script.js so cart logic stays in one place

// Reads whatever was fetched last time (from a previous visit) so the grid
// can render immediately on load instead of showing empty until the network
// call finishes - the "loads blank, then pops in 2-3s later" issue.
function loadCachedProducts() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveCachedProducts(list) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
}

// Same SVG glyph the original static cards used per category, so the
// visual style is unchanged even though the cards are now generated.
const CATEGORY_ICONS = {
  milk: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><path d="M8 2h8M9 2v5.2a3 3 0 0 1-.6 1.8L6 12.4A4 4 0 0 0 5 15v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a4 4 0 0 0-1-2.6l-2.4-3.4A3 3 0 0 1 15 7.2V2"/></svg>',
  paneer: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>',
  ghee: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  curd: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><path d="M6 11c0-4 3-7 6-9 3 2 6 5 6 9a6 6 0 0 1-12 0Z"/></svg>'
};
const FAV_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

// Looks up the live quantity of a product currently in the cart (script.js's
// window.cart, keyed by product id) so cards can show a live +/qty/- stepper
// instead of a static "+" once something has been added. Keyed by id (not
// name) since two different products can share a display name.
function cartQtyFor(p) {
  const entry = window.cart && window.cart[p._id];
  return entry ? entry.qty : 0;
}

// Tracks which product ids are currently showing the brief "Added ✓"
// confirmation state, right after the first tap, before settling into
// the persistent -/qty/+ stepper.
const justAddedIds = new Set();

function addBtnHtml(p, outOfStock) {
  const qty = cartQtyFor(p);

  if (justAddedIds.has(p._id)) {
    return `<button class="prod-added" disabled data-id="${p._id}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      Added
    </button>`;
  }

  if (qty > 0) {
    return `
      <div class="prod-stepper" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}">
        <button class="prod-step-btn" data-step="dec" aria-label="Remove one">&minus;</button>
        <span class="prod-step-qty">${qty}</span>
        <button class="prod-step-btn" data-step="inc" aria-label="Add one" ${outOfStock ? 'disabled' : ''}>+</button>
      </div>`;
  }
  return `<button class="prod-add" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}" ${outOfStock ? 'disabled' : ''}>+</button>`;
}

// Shows the "Added ✓" state for a product for a moment, then re-renders
// into the normal stepper. Called right after the very first add so the
// user gets clear confirmation before the +/- controls appear.
function flashAdded(productId) {
  justAddedIds.add(productId);
  renderGrid();
  renderHomeFeaturedRail();
  setTimeout(() => {
    justAddedIds.delete(productId);
    renderGrid();
    renderHomeFeaturedRail();
  }, 900);
}

function resolveImageUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`;
}

// Builds the thumbnail area for a card: a single static image/icon if there's
// 0-1 images, or a swipeable + auto-scrolling carousel (dots included) if the
// product has multiple images. Each carousel gets a unique id so its own
// interval/observer doesn't clash with any other card's.
let carouselSeq = 0;
function buildThumbHtml(p, sizePx) {
  const fallback = (CATEGORY_ICONS[p.category] || CATEGORY_ICONS.milk).replace(/"/g, '&quot;');
  const urls = Array.isArray(p.images) ? p.images.map(resolveImageUrl).filter(Boolean) : [];

  if (urls.length === 0) return CATEGORY_ICONS[p.category] || CATEGORY_ICONS.milk;

  if (urls.length === 1) {
    return `<img src="${urls[0]}" alt="${p.name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.outerHTML='${fallback}'">`;
  }

  const cid = `car-${++carouselSeq}`;
  const slides = urls.map((u, i) =>
    `<div class="prod-car-slide"><img src="${u}" alt="${p.name}" loading="${i === 0 ? 'eager' : 'lazy'}" onerror="this.parentElement.style.display='none'"></div>`
  ).join('');
  const dots = urls.map((_, i) => `<span class="prod-car-dot${i === 0 ? ' active' : ''}"></span>`).join('');

  return `
    <div class="prod-car" id="${cid}" data-autoscroll>
      <div class="prod-car-track">${slides}</div>
      <div class="prod-car-dots">${dots}</div>
    </div>`;
}

// Wires up swipe/scroll-driven dot sync + auto-scroll for every carousel
// currently in the DOM. Called after every render since innerHTML wipes
// out any previous listeners/timers.
const carouselTimers = [];
function initCarousels(container) {
  carouselTimers.forEach(clearInterval);
  carouselTimers.length = 0;

  container.querySelectorAll('[data-autoscroll]').forEach(car => {
    const track = car.querySelector('.prod-car-track');
    const dots = car.querySelectorAll('.prod-car-dot');
    const slideCount = dots.length;
    if (!track || slideCount < 2) return;

    let index = 0;
    let paused = false;

    const goTo = (i) => {
      index = (i + slideCount) % slideCount;
      track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
      dots.forEach((d, di) => d.classList.toggle('active', di === index));
    };

    // Auto-advance every 2.5s, looping back to the first image.
    const timer = setInterval(() => { if (!paused) goTo(index + 1); }, 2500);
    carouselTimers.push(timer);

    // Pause auto-scroll while the user is actively swiping/dragging, and
    // sync the dots to wherever they land manually.
    let scrollDebounce;
    track.addEventListener('touchstart', () => { paused = true; }, { passive: true });
    track.addEventListener('mousedown', () => { paused = true; });
    track.addEventListener('scroll', () => {
      clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        index = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((d, di) => d.classList.toggle('active', di === index));
        paused = false; // resume auto-scroll a moment after the user stops
      }, 150);
    }, { passive: true });
  });
}

function productCardHtml(p) {
  const discountPct = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const thumb = buildThumbHtml(p);
  const outOfStock = !p.available || p.stock <= 0;

  return `
    <div class="prod-card grid${outOfStock ? ' out-of-stock' : ''}" data-cat="${p.category}" data-id="${p._id}">
      <div class="prod-thumb">
        ${discountPct > 0 ? `<span class="disc">-${discountPct}%</span>` : ''}
        <span class="fav">${FAV_ICON}</span>
        ${thumb}
        ${outOfStock ? '<span class="oos-badge">Out of stock</span>' : ''}
      </div>
      <div class="prod-body">
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">${p.unit}${p.desc ? ' &middot; ' + p.desc : ''}</div>
        <div class="prod-bottom">
          <div class="prod-price">${discountPct > 0 ? `<s>₹${p.mrp}</s>` : ''}₹${p.price}</div>
          ${addBtnHtml(p, outOfStock)}
        </div>
      </div>
    </div>`;
}

function productRailCardHtml(p) {
  const discountPct = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const thumb = buildThumbHtml(p);

  return `
    <div class="prod-card" data-id="${p._id}">
      <div class="prod-thumb">
        ${discountPct > 0 ? `<span class="disc">-${discountPct}%</span>` : ''}
        <span class="fav">${FAV_ICON}</span>
        ${thumb}
      </div>
      <div class="prod-body">
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">${p.unit}${p.desc ? ' &middot; ' + p.desc : ''}</div>
        <div class="prod-bottom">
          <div class="prod-price">${discountPct > 0 ? `<s>₹${p.mrp}</s>` : ''}₹${p.price}</div>
          ${addBtnHtml(p, !p.available || p.stock <= 0)}
        </div>
      </div>
    </div>`;
}

function renderHomeFeaturedRail() {
  const rail = document.getElementById('homeFeaturedRail');
  if (!rail) return;

  const featured = allProducts.filter(p => p.featured && p.available && p.stock > 0).slice(0, 8);
  const toShow = featured.length ? featured : allProducts.filter(p => p.available && p.stock > 0).slice(0, 8);
  rail.innerHTML = toShow.map(productRailCardHtml).join('');
  initCarousels(rail);

  rail.querySelectorAll('.prod-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { id, name, price } = btn.dataset;
      if (typeof onAddToCart === 'function') onAddToCart({ id, name, price: Number(price) }, btn);
      flashAdded(id);
    });
  });
  wireSteppers(rail);
}

function renderGrid() {
  const grid = document.getElementById('prodGrid');
  if (!grid) return;

  const visible = currentFilter === 'all' ? allProducts : allProducts.filter(p => p.category === currentFilter);
  grid.innerHTML = visible.map(productCardHtml).join('') ||
    `<div class="prod-empty">No products in this category right now.</div>`;
  initCarousels(grid);

  // Re-wire add buttons every render since innerHTML replaced the elements.
  grid.querySelectorAll('.prod-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const { id, name, price } = btn.dataset;
      if (typeof onAddToCart === 'function') onAddToCart({ id, name, price: Number(price) }, btn);
      flashAdded(id);
    });
  });
  wireSteppers(grid);
}

// Wires the -/qty/+ stepper controls that replace the "+" button once an
// item is already in the cart. "+" adds another (with fly animation),
// "-" removes one - both go through the same onAddToCart/window.cart flow
// so script.js's cart stays the single source of truth.
function wireSteppers(container) {
  container.querySelectorAll('.prod-stepper').forEach(stepper => {
    const { id, name, price } = stepper.dataset;
    const incBtn = stepper.querySelector('[data-step="inc"]');
    const decBtn = stepper.querySelector('[data-step="dec"]');

    incBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (incBtn.disabled) return;
      if (typeof onAddToCart === 'function') onAddToCart({ id, name, price: Number(price) }, incBtn);
    });

    decBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.decrementCartItem === 'function') window.decrementCartItem(id);
    });
  });
}

async function loadProducts() {
  try {
    allProducts = await productsApi.list({ available: true });
    saveCachedProducts(allProducts);
    renderGrid();
    renderHomeFeaturedRail();
  } catch (err) {
    console.error('[products] failed to load:', err.message);
    // Network/backend not reachable - keep showing whatever cached data
    // (or the initial render) is already on screen instead of blanking it
    // out with an error, unless there's truly nothing to show at all.
    if (!allProducts.length) {
      const grid = document.getElementById('prodGrid');
      if (grid) grid.innerHTML = `<div class="prod-empty">Couldn't load products. Pull to refresh or check your connection.</div>`;
    }
  }
}

// Called once from script.js after DOM is ready.
export function initProducts({ onAdd }) {
  onAddToCart = onAdd;

  // Render instantly from last-known data (if any) so the page never shows
  // an empty grid while waiting on the network - then loadProducts() below
  // silently refreshes it with the live backend data.
  const cached = loadCachedProducts();
  if (cached.length) {
    allProducts = cached;
    renderGrid();
    renderHomeFeaturedRail();
  }

  loadProducts();

  // Filter chips (All / Milk / Paneer / Ghee / Curd) - same behaviour as before,
  // just filtering the live-fetched array instead of hiding static DOM nodes.
  document.querySelectorAll('#prodFilterRow .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#prodFilterRow .cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderGrid();
    });
  });

  // Cart changed (add/remove/qty change from anywhere - cards, cart screen,
  // etc.) -> re-render cards from the already-fetched list so each card's
  // +/qty/- stepper reflects the live cart count, no refetch needed.
  window.onCartChanged = () => {
    renderGrid();
    renderHomeFeaturedRail();
  };

  // Live update: admin adds/edits/deletes/restocks a product -> re-render
  // instantly, no reload. kind is 'product' for this event; other kinds
  // (coupon/banner/plan/etc) are handled by their own modules.
  onSocket('catalog:changed', ({ kind }) => {
    if (kind === 'product') loadProducts();
  });
}

export function getProductById(id) {
  return allProducts.find(p => p._id === id);
}

export function getAllProducts() {
  return allProducts;
}
