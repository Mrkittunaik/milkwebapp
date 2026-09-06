/* =========================================================
   DELIVERY BOY: ACCEPT / REJECT INCOMING ORDERS
   Frontend counterpart to the backend's broadcast-offer flow
   (PATCH /api/orders/:id/offer and /:id/respond). This is for
   the delivery-boy app specifically - only mount it there
   (role === 'delivery').

   Usage (in the delivery app's script.js):
     import { initDeliveryOfferListener } from './js/delivery-accept.js';
     initDeliveryOfferListener({ mountEl: document.getElementById('offerMount') });
========================================================= */

import { ordersApi } from './api.js';
import { onSocket } from './socket.js';

const activeOfferCards = new Map(); // orderId -> DOM element

function renderOfferCard(order, mountEl) {
  const card = document.createElement('div');
  card.className = 'order-offer-card';
  card.dataset.orderId = order._id;
  card.innerHTML = `
    <div class="offer-card-head">
      <span class="offer-card-badge">New order</span>
      <span class="offer-card-code">${order.orderCode}</span>
    </div>
    <div class="offer-card-address">${order.address || 'Address not available'}</div>
    <div class="offer-card-total">₹${order.total} &middot; ${order.items.length} item${order.items.length > 1 ? 's' : ''}</div>
    <div class="offer-card-actions">
      <button class="offer-reject-btn">Reject</button>
      <button class="offer-accept-btn">Accept</button>
    </div>
    <div class="offer-card-status" style="display:none;"></div>
  `;

  const acceptBtn = card.querySelector('.offer-accept-btn');
  const rejectBtn = card.querySelector('.offer-reject-btn');
  const statusEl = card.querySelector('.offer-card-status');
  const actionsEl = card.querySelector('.offer-card-actions');

  function setBusy(busy) {
    acceptBtn.disabled = busy;
    rejectBtn.disabled = busy;
  }

  acceptBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      const res = await ordersApi.respond(order._id, 'accept');
      actionsEl.style.display = 'none';
      statusEl.style.display = 'block';
      statusEl.textContent = 'Accepted — head to the customer';
      statusEl.className = 'offer-card-status accepted';
      setTimeout(() => removeCard(order._id), 2000);
    } catch (err) {
      // 409 means someone else accepted first between the offer landing
      // here and this tap - the order:takenByOther socket event usually
      // beats this response, but handle it defensively either way.
      actionsEl.style.display = 'none';
      statusEl.style.display = 'block';
      statusEl.textContent = err.status === 409 ? 'Already taken by another rider' : 'Could not accept - try again';
      statusEl.className = 'offer-card-status failed';
      setTimeout(() => removeCard(order._id), 2000);
    }
  });

  rejectBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      await ordersApi.respond(order._id, 'reject');
    } catch (err) { /* already resolved one way or another - just remove it below */ }
    removeCard(order._id);
  });

  mountEl.prepend(card);
  activeOfferCards.set(String(order._id), card);

  // Auto-play a sound/vibration so a new job doesn't go unnoticed -
  // matches SOCKETS.md's "new job drops straight into the queue, plays a sound".
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function removeCard(orderId) {
  const card = activeOfferCards.get(String(orderId));
  if (card) {
    card.remove();
    activeOfferCards.delete(String(orderId));
  }
}

export function initDeliveryOfferListener({ mountEl }) {
  if (!mountEl) {
    console.warn('[delivery-accept] no mountEl provided, offer cards will not render');
    return;
  }

  onSocket('order:offered', (order) => {
    renderOfferCard(order, mountEl);
  });

  // Another driver accepted first - pull the card immediately so this
  // driver isn't left tapping Accept on a job that's already gone.
  onSocket('order:takenByOther', ({ _id }) => {
    removeCard(_id);
  });
}
