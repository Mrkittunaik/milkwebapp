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

let allProducts = [];      // last fetched list, kept fresh by socket events
let currentFilter = 'all';
let onAddToCart = null;    // injected by script.js so cart logic stays in one place

// Same SVG glyph the original static cards used per category, so the
// visual style is unchanged even though the cards are now generated.
const CATEGORY_ICONS = {
  milk: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><path d="M8 2h8M9 2v5.2a3 3 0 0 1-.6 1.8L6 12.4A4 4 0 0 0 5 15v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a4 4 0 0 0-1-2.6l-2.4-3.4A3 3 0 0 1 15 7.2V2"/></svg>',
  paneer: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>',
  ghee: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  curd: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><path d="M6 11c0-4 3-7 6-9 3 2 6 5 6 9a6 6 0 0 1-12 0Z"/></svg>'
};
const FAV_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

function productCardHtml(p) {
  const discountPct = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const thumb = p.images && p.images[0]
    ? `<img src="${API_BASE}${p.images[0]}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
    : (CATEGORY_ICONS[p.category] || CATEGORY_ICONS.milk);
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
          <button class="prod-add" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}" ${outOfStock ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>`;
}

function productRailCardHtml(p) {
  const discountPct = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const thumb = p.images && p.images[0]
    ? `<img src="${API_BASE}${p.images[0]}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
    : (CATEGORY_ICONS[p.category] || CATEGORY_ICONS.milk);

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
          <button class="prod-add" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}">+</button>
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

  rail.querySelectorAll('.prod-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { id, name, price } = btn.dataset;
      if (typeof onAddToCart === 'function') onAddToCart({ id, name, price: Number(price) }, btn);
    });
  });
}

function renderGrid() {
  const grid = document.getElementById('prodGrid');
  if (!grid) return;

  const visible = currentFilter === 'all' ? allProducts : allProducts.filter(p => p.category === currentFilter);
  grid.innerHTML = visible.map(productCardHtml).join('') ||
    `<div class="prod-empty">No products in this category right now.</div>`;

  // Re-wire add buttons every render since innerHTML replaced the elements.
  grid.querySelectorAll('.prod-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const { id, name, price } = btn.dataset;
      if (typeof onAddToCart === 'function') onAddToCart({ id, name, price: Number(price) }, btn);
    });
  });
}

async function loadProducts() {
  try {
    allProducts = await productsApi.list({ available: true });
    renderGrid();
    renderHomeFeaturedRail();
  } catch (err) {
    console.error('[products] failed to load:', err.message);
    const grid = document.getElementById('prodGrid');
    if (grid) grid.innerHTML = `<div class="prod-empty">Couldn't load products. Pull to refresh or check your connection.</div>`;
  }
}

// Called once from script.js after DOM is ready.
export function initProducts({ onAdd }) {
  onAddToCart = onAdd;
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
