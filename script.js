  // ---- App state ----
  const cart = {}; // name -> {name, price, qty}

  // ---- Auth/session state (hoisted so nav/checkout gating can use it) ----
  const SESSION_STORAGE_KEY = 'pd_user_session';

  const userSession = {
    loggedIn: false,
    googleId: null,
    email: null,
    name: null,
    phone: null,
    blocked: false
  };

  function saveSession(){
    try{
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userSession));
    } catch(e){
      // Storage blocked (private/incognito mode, file:// origin, or
      // sandboxed preview with storage disabled) — session won't persist
      // across reloads in that case. This is a browser/environment
      // restriction, not something JS can work around.
      console.warn('Could not save session — storage unavailable:', e);
    }
  }

  function loadSession(){
    try{
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if(!raw) return;
      const saved = JSON.parse(raw);
      Object.assign(userSession, saved);
    } catch(e){
      console.warn('Could not load saved session:', e);
    }
  }

  function clearSession(){
    userSession.loggedIn = false;
    userSession.googleId = null;
    userSession.email = null;
    userSession.name = null;
    userSession.phone = null;
    userSession.blocked = false;
    try{ localStorage.removeItem(SESSION_STORAGE_KEY); } catch(e){}
  }

  // Real integration point: call this on app load (and periodically, or on
  // socket event "user:blocked") to check the admin panel's blocked flag —
  // GET /api/users/:id/status -> { blocked: true/false }. If true, force
  // the user back to the login gate even though a session was saved.
  async function checkAccountBlocked(){
    if(!userSession.loggedIn) return false;
    // Placeholder — wire to real endpoint once backend exists:
    // const res = await fetch(`/api/users/${userSession.phone}/status`);
    // const data = await res.json();
    // return !!data.blocked;
    return userSession.blocked === true;
  }

  let pendingAuthAction = null; // fn to run automatically once login succeeds

  // ---- Screen navigation ----
  function goToScreen(name){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const target = document.getElementById('screen-' + name);
    if(target) target.classList.add('active');
    document.querySelectorAll('.nav-item[data-screen]').forEach(n=>{
      n.classList.toggle('active', n.dataset.screen === name);
    });
    const scr = document.querySelector('.screen.active');
    if(scr) scr.scrollTop = 0;
  }

  document.querySelectorAll('.nav-item[data-screen]').forEach(item=>{
    item.addEventListener('click', ()=> goToScreen(item.dataset.screen));
  });

  document.querySelectorAll('[data-goto]').forEach(el=>{
    el.addEventListener('click', ()=> goToScreen(el.dataset.goto));
  });

  // FAB: quick jump to Cart
  document.getElementById('navFab').addEventListener('click', ()=>{
    goToScreen('cart');
  });

  // ---- Product filter chips ----
  document.querySelectorAll('#prodFilterRow .cat-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('#prodFilterRow .cat-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;
      document.querySelectorAll('#prodGrid .prod-card').forEach(card=>{
        card.classList.toggle('hidden', filter !== 'all' && card.dataset.cat !== filter);
      });
    });
  });

  // ---- Cart rendering ----
  function renderCart(){
    const list = document.getElementById('cartList');
    const empty = document.getElementById('cartEmpty');
    const summary = document.getElementById('cartSummary');
    const totalEl = document.getElementById('cartTotal');
    const items = Object.values(cart);
    list.innerHTML = '';
    let total = 0, count = 0;

    if(items.length === 0){
      empty.style.display = 'flex';
      summary.style.display = 'none';
    } else {
      empty.style.display = 'none';
      summary.style.display = 'block';
      items.forEach(item=>{
        total += item.price * item.qty;
        count += item.qty;
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div class="cart-item-ic">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2h8M9 2v5.2a3 3 0 0 1-.6 1.8L6 12.4A4 4 0 0 0 5 15v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a4 4 0 0 0-1-2.6l-2.4-3.4A3 3 0 0 1 15 7.2V2"/></svg>
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">₹${item.price} &times; ${item.qty}</div>
          </div>
          <div class="cart-item-qty">
            <button data-act="dec" data-key="${item.name}">−</button>
            <span>${item.qty}</span>
            <button data-act="inc" data-key="${item.name}">+</button>
          </div>`;
        list.appendChild(row);
      });
    }

    totalEl.textContent = '₹' + total;

    // badges
    const navBadge = document.getElementById('navCartBadge');
    const cartIcon = document.querySelector('.icon-btn[aria-label="Cart"] .badge');
    if(count > 0){
      navBadge.style.display = 'flex';
      navBadge.textContent = count;
      if(cartIcon) cartIcon.textContent = count;
    } else {
      navBadge.style.display = 'none';
      if(cartIcon) cartIcon.textContent = 0;
    }

    // wire qty buttons
    list.querySelectorAll('button[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const key = btn.dataset.key;
        if(!cart[key]) return;
        if(btn.dataset.act === 'inc') cart[key].qty++;
        else {
          cart[key].qty--;
          if(cart[key].qty <= 0) delete cart[key];
        }
        renderCart();
      });
    });
  }

  function addToCart(name, price){
    if(!cart[name]) cart[name] = {name, price, qty:0};
    cart[name].qty++;
    renderCart();
  }

  // ---- Fly-to-cart animation ----
  function flyToCart(sourceEl){
    const cartTarget = document.querySelector('.icon-btn[aria-label="Cart"]');
    if(!cartTarget) return;
    const start = sourceEl.getBoundingClientRect();
    const end = cartTarget.getBoundingClientRect();

    const dot = document.createElement('div');
    dot.className = 'fly-dot';
    const size = 14;
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
    dot.style.left = (start.left + start.width/2 - size/2) + 'px';
    dot.style.top = (start.top + start.height/2 - size/2) + 'px';
    dot.style.transition = 'transform .55s cubic-bezier(.2,.8,.3,1), opacity .55s ease';
    document.body.appendChild(dot);

    const dx = (end.left + end.width/2) - (start.left + start.width/2);
    const dy = (end.top + end.height/2) - (start.top + start.height/2);

    requestAnimationFrame(()=>{
      dot.style.transform = `translate(${dx}px, ${dy}px) scale(.3)`;
      dot.style.opacity = '0.2';
    });

    setTimeout(()=>{
      dot.remove();
      cartTarget.classList.add('cart-pulse');
      setTimeout(()=> cartTarget.classList.remove('cart-pulse'), 400);
    }, 550);
  }

  // ---- Wire every "add" button (product + and package subscribe) ----
  document.querySelectorAll('.prod-add').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price || '0');
      if(name){
        addToCart(name, price);
        flyToCart(btn);
        btn.classList.add('add-pop');
        setTimeout(()=> btn.classList.remove('add-pop'), 300);
      }
    });
  });

  document.querySelectorAll('.pkg-btn[data-name]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price || '0');
      addToCart(name, price);
      flyToCart(btn);
      const original = btn.textContent;
      btn.textContent = 'Added ✓';
      btn.classList.add('add-pop');
      setTimeout(()=>{ btn.textContent = original; btn.classList.remove('add-pop'); }, 900);
    });
  });

  renderCart();


  (function(){
    const rail = document.getElementById('catRail');
    let pos = 0, paused = false;
    let rafId = null;
    rail.addEventListener('touchstart', ()=>paused=true);
    rail.addEventListener('touchend', ()=>setTimeout(()=>paused=false,2500));
    rail.addEventListener('mouseenter', ()=>paused=true);
    rail.addEventListener('mouseleave', ()=>paused=false);

    function step(){
      if(!paused){
        const max = rail.scrollWidth - rail.clientWidth;
        if(max > 0){
          pos += 0.35;
          // smoothly wrap by drifting back to 0 instead of snapping
          if(pos > max) pos = 0;
          rail.scrollLeft = pos;
        }
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  })();

  // ---- Auto-scroll promo banner (snap, one card at a time) ----
  (function(){
    const rail = document.getElementById('promoRail');
    const dots = document.querySelectorAll('#promoDots .promo-dot');
    let idx = 0;
    const count = dots.length;
    let paused = false;
    rail.addEventListener('touchstart', ()=>paused=true);
    rail.addEventListener('touchend', ()=>setTimeout(()=>paused=false,3000));
    setInterval(()=>{
      if(paused) return;
      idx = (idx + 1) % count;
      rail.scrollTo({left: rail.clientWidth * idx, behavior:'smooth'});
      dots.forEach((d,i)=>d.classList.toggle('active', i===idx));
    }, 3200);
  })();

  /* =========================================================
     TOAST
  ========================================================= */
  let toastTimer = null;
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
  }

  /* =========================================================
     RIPPLE EFFECT for .ripple buttons
  ========================================================= */
  document.querySelectorAll('.ripple').forEach(btn=>{
    btn.addEventListener('click', function(e){
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const span = document.createElement('span');
      span.className = 'ripple-effect';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size/2) + 'px';
      span.style.top = (e.clientY - rect.top - size/2) + 'px';
      btn.appendChild(span);
      setTimeout(()=> span.remove(), 500);
    });
  });

  /* =========================================================
     WISHLIST
  ========================================================= */
  const wishlist = {}; // name -> {name, price, cat, icon}

  function findProdCard(favEl){
    return favEl.closest('.prod-card');
  }

  function renderWishBadge(){
    const badge = document.getElementById('wishBadge');
    const count = Object.keys(wishlist).length;
    if(count > 0){ badge.style.display='flex'; badge.textContent = count; }
    else { badge.style.display='none'; }
  }

  function renderWishlistScreen(){
    const grid = document.getElementById('wishGrid');
    const empty = document.getElementById('wishEmpty');
    const items = Object.values(wishlist);
    grid.innerHTML = '';
    if(items.length === 0){
      empty.style.display = 'flex';
      grid.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    grid.style.display = 'grid';
    items.forEach(item=>{
      const card = document.createElement('div');
      card.className = 'prod-card grid';
      card.innerHTML = `
        <div class="prod-thumb">
          <span class="fav liked" data-name="${item.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </span>
          ${item.icon || '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF6D" stroke-width="1.6"><path d="M8 2h8M9 2v5.2a3 3 0 0 1-.6 1.8L6 12.4A4 4 0 0 0 5 15v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a4 4 0 0 0-1-2.6l-2.4-3.4A3 3 0 0 1 15 7.2V2"/></svg>'}
        </div>
        <div class="prod-body">
          <div class="prod-name">${item.name}</div>
          <div class="prod-meta">${item.meta || ''}</div>
          <div class="prod-bottom">
            <div class="prod-price">₹${item.price}</div>
            <button class="prod-add" data-name="${item.name}" data-price="${item.price}">+</button>
          </div>
        </div>`;
      grid.appendChild(card);
    });
    // wire remove-heart
    grid.querySelectorAll('.fav').forEach(f=>{
      f.addEventListener('click', (e)=>{
        e.stopPropagation();
        delete wishlist[f.dataset.name];
        renderWishBadge();
        renderWishlistScreen();
        syncProductHearts();
        showToast('Removed from wishlist');
      });
    });
    // wire add-to-cart from wishlist
    grid.querySelectorAll('.prod-add').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        addToCart(btn.dataset.name, parseFloat(btn.dataset.price||'0'));
        flyToCart(btn);
        showToast(btn.dataset.name + ' added to cart');
      });
    });
  }

  function syncProductHearts(){
    document.querySelectorAll('.prod-card .fav').forEach(fav=>{
      const card = findProdCard(fav);
      const addBtn = card ? card.querySelector('.prod-add') : null;
      const name = addBtn ? addBtn.dataset.name : null;
      if(name && wishlist[name]) fav.classList.add('liked');
      else fav.classList.remove('liked');
    });
  }

  document.querySelectorAll('.prod-card .fav').forEach(fav=>{
    fav.addEventListener('click', (e)=>{
      e.stopPropagation();
      const card = findProdCard(fav);
      const addBtn = card ? card.querySelector('.prod-add') : null;
      if(!addBtn) return;
      const name = addBtn.dataset.name;
      const price = addBtn.dataset.price;
      const nameEl = card.querySelector('.prod-name');
      const metaEl = card.querySelector('.prod-meta');
      const thumbSvg = card.querySelector('.prod-thumb svg:not(.fav svg)');

      fav.classList.add('pop');
      setTimeout(()=> fav.classList.remove('pop'), 400);

      if(wishlist[name]){
        delete wishlist[name];
        fav.classList.remove('liked');
        showToast('Removed from wishlist');
      } else {
        wishlist[name] = {
          name, price,
          meta: metaEl ? metaEl.textContent : '',
          icon: thumbSvg ? thumbSvg.outerHTML : ''
        };
        fav.classList.add('liked');
        showToast('Added to wishlist ❤');
      }
      renderWishBadge();
      renderWishlistScreen();
    });
  });

  /* =========================================================
     TOP CART BADGE sync (in addition to existing nav badge)
  ========================================================= */
  const _origRenderCart = renderCart;
  renderCart = function(){
    _origRenderCart();
    const count = Object.values(cart).reduce((s,i)=>s+i.qty,0);
    const topBadge = document.getElementById('topCartBadge');
    if(topBadge){
      if(count > 0){ topBadge.style.display='flex'; topBadge.textContent = count; }
      else { topBadge.style.display='none'; }
    }
    // update payment screen totals if present
    const total = Object.values(cart).reduce((s,i)=>s+i.price*i.qty,0);
    const paySub = document.getElementById('paySubtotal');
    const payTotal = document.getElementById('payTotal');
    if(paySub) paySub.textContent = '₹' + total;
    if(payTotal) payTotal.textContent = '₹' + total;
  };
  renderCart();

  /* =========================================================
     CHECKOUT -> PAYMENT FLOW
  ========================================================= */
  const checkoutBtn = document.getElementById('checkoutBtn');
  if(checkoutBtn){
    checkoutBtn.addEventListener('click', ()=>{
      if(Object.keys(cart).length === 0){
        showToast('Your cart is empty');
        return;
      }
      const proceedToDetails = ()=>{
        renderDetailsScreen();
        goToScreen('details');
      };
      if(!userSession.loggedIn){
        openLoginGate(proceedToDetails);
        return;
      }
      proceedToDetails();
    });
  }

  document.querySelectorAll('.pay-method').forEach(pm=>{
    pm.addEventListener('click', ()=>{
      document.querySelectorAll('.pay-method').forEach(x=>x.classList.remove('selected'));
      pm.classList.add('selected');
    });
  });

  const payNowBtn = document.getElementById('payNowBtn');
  if(payNowBtn){
    payNowBtn.addEventListener('click', ()=>{
      if(Object.keys(cart).length === 0){
        showToast('Your cart is empty');
        return;
      }
      const selectedMethod = document.querySelector('.pay-method.selected');
      const method = selectedMethod ? selectedMethod.dataset.method : 'upi';

      if(method === 'cod'){
        placeOrder('cod', null);
        return;
      }
      launchPaymentGateway(method);
    });
  }

  /* =========================================================
     PAYMENT GATEWAY: Razorpay integration point.
     Swap RAZORPAY_KEY_ID with the real key from your backend/.env
     once the /api/payments/create-order endpoint exists. Until then
     this runs a realistic simulated flow so the UI/UX is fully wired.
  ========================================================= */
  const RAZORPAY_KEY_ID = 'rzp_test_REPLACE_WITH_REAL_KEY';

  function getOrderTotalPaise(){
    const totalText = (document.getElementById('payTotal') || {}).textContent || '₹0';
    const rupees = parseInt(totalText.replace(/[^\d]/g,''), 10) || 0;
    return rupees * 100;
  }

  function launchPaymentGateway(method){
    payNowBtn.textContent = 'Processing...';
    payNowBtn.disabled = true;

    // Real integration (once backend order-create endpoint exists):
    //   1. POST /api/payments/create-order { amount, currency:'INR' } -> { orderId }
    //   2. Open Razorpay checkout with that orderId
    //   3. On success, POST /api/payments/verify with the signature
    //   4. Then call placeOrder(method, paymentRef)
    if(window.Razorpay && RAZORPAY_KEY_ID.indexOf('REPLACE') === -1){
      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY_ID,
        amount: getOrderTotalPaise(),
        currency: 'INR',
        name: 'Pakka Doodhwala',
        description: 'Order payment',
        theme: { color: '#FDC202' },
        handler: function(response){
          placeOrder(method, response.razorpay_payment_id);
        },
        modal: {
          ondismiss: function(){
            payNowBtn.textContent = 'Pay & Place Order';
            payNowBtn.disabled = false;
            showToast('Payment cancelled');
          }
        }
      });
      rzp.open();
      return;
    }

    // Simulated gateway flow (used until Razorpay script + real key are wired in)
    setTimeout(()=>{
      placeOrder(method, 'SIMULATED_PAY_' + Date.now());
    }, 1100);
  }

  function placeOrder(method, paymentRef){
    payNowBtn.textContent = 'Pay & Place Order';
    payNowBtn.disabled = false;
    document.getElementById('successOverlay').classList.add('show');

    // Full order payload ready for POST /api/orders once backend exists:
    // { items: cart, ...orderDetails, paymentMethod: method, paymentRef }
    const orderPayload = Object.assign({}, orderDetails, {
      items: cart,
      paymentMethod: method,
      paymentRef: paymentRef || null
    });
    window.__lastOrderPayload = orderPayload; // inspectable for wiring/testing

    // Demo: start the home-topbar ETA countdown as if backend just marked
    // this order "out for delivery" with a 40-minute estimate.
    startDeliveryEta(40);

    Object.keys(cart).forEach(k=>delete cart[k]);
    renderCart();
  }

  const successDoneBtn = document.getElementById('successDoneBtn');
  if(successDoneBtn){
    successDoneBtn.addEventListener('click', ()=>{
      document.getElementById('successOverlay').classList.remove('show');
      goToScreen('home');
    });
  }

  /* =========================================================
     LOCATION: geolocation permission + reverse geocode
  ========================================================= */
  const addrRow = document.getElementById('addrRow');
  const locBackdrop = document.getElementById('locBackdrop');
  const locCancelBtn = document.getElementById('locCancelBtn');
  const useLocBtn = document.getElementById('useLocBtn');
  const useLocBtnText = document.getElementById('useLocBtnText');
  const addrLabel = document.getElementById('addrLabel');
  const locCurrentLabel = document.getElementById('locCurrentLabel');
  const payAddr = document.getElementById('payAddr');

  function openLocModal(){
    locCurrentLabel.textContent = addrLabel.textContent;
    locBackdrop.classList.add('show');
  }
  function closeLocModal(){
    locBackdrop.classList.remove('show');
  }
  if(addrRow) addrRow.addEventListener('click', openLocModal);
  if(locCancelBtn) locCancelBtn.addEventListener('click', closeLocModal);
  if(locBackdrop) locBackdrop.addEventListener('click', (e)=>{
    if(e.target === locBackdrop) closeLocModal();
  });

  function setDeliveryAddress(text){
    addrLabel.innerHTML = text;
    if(payAddr) payAddr.innerHTML = text;
    const settingsAddr = document.querySelector('.settings-row-label');
    if(settingsAddr) settingsAddr.textContent = text.replace(/<[^>]+>/g,'');
  }

  async function reverseGeocode(lat, lon){
    try{
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`, {
        headers: { 'Accept': 'application/json' }
      });
      if(!res.ok) throw new Error('reverse geocode failed');
      const data = await res.json();
      const a = data.address || {};
      const area = a.suburb || a.neighbourhood || a.residential || a.city_district || a.village || 'Kondapur';
      const city = a.city || a.town || a.state_district || 'Hyderabad';
      return `Current &middot; ${area}, ${city}`;
    } catch(err){
      // fallback: Hyderabad - Kondapur default if geocoding unavailable
      return 'Current &middot; Kondapur, Hyderabad';
    }
  }

  if(useLocBtn){
    useLocBtn.addEventListener('click', ()=>{
      if(!navigator.geolocation){
        showToast('Geolocation not supported on this device');
        setDeliveryAddress('Current &middot; Kondapur, Hyderabad');
        closeLocModal();
        return;
      }
      useLocBtn.classList.add('loading');
      useLocBtnText.textContent = 'Fetching location...';
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      useLocBtn.prepend(spinner);

      navigator.geolocation.getCurrentPosition(async (pos)=>{
        const { latitude, longitude } = pos.coords;
        const label = await reverseGeocode(latitude, longitude);
        setDeliveryAddress(label);
        useLocBtn.classList.remove('loading');
        useLocBtnText.textContent = 'Use my current location';
        spinner.remove();
        closeLocModal();
        showToast('Delivery location updated');
      }, (err)=>{
        useLocBtn.classList.remove('loading');
        useLocBtnText.textContent = 'Use my current location';
        spinner.remove();
        // Permission denied or unavailable -> sensible Hyderabad/Kondapur fallback
        setDeliveryAddress('Current &middot; Kondapur, Hyderabad');
        closeLocModal();
        if(err && err.code === 1){
          showToast('Location permission denied — using Kondapur, Hyderabad');
        } else {
          showToast('Could not fetch live location — using Kondapur, Hyderabad');
        }
      }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
    });
  }

  /* =========================================================
     DETAILS SCREEN: saved addresses, add-new, contact, note, plan timing
     Everything is saved together in one "Save & Continue" step.
     Persists in-memory + localStorage-free (per privacy: no browser storage
     required here, uses a simple in-page state object) so backend wiring
     later just needs to POST this object on order creation.
  ========================================================= */
  const savedAddresses = [];
  let pendingCartHasPlan = false; // set true when a subscription/plan item is in cart

  const orderDetails = {
    addressId: null,
    phone: '',
    altPhone: '',
    note: '',
    deliveryTime: '07:00',
    skipTomorrow: false
  };

  function renderSavedAddrList(){
    const list = document.getElementById('savedAddrList');
    if(!list) return;
    list.innerHTML = '';
    savedAddresses.forEach(addr=>{
      const card = document.createElement('div');
      card.className = 'det-addr-card' + (addr.id === orderDetails.addressId ? ' selected' : '');
      card.dataset.id = addr.id;
      card.innerHTML = `
        <div class="det-addr-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A3110" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>
        <div style="flex:1;">
          <div class="det-addr-label">${addr.label}</div>
          <div class="det-addr-full">${addr.full}</div>
        </div>
        <div class="det-addr-radio"></div>
      `;
      card.addEventListener('click', ()=>{
        orderDetails.addressId = addr.id;
        renderSavedAddrList();
        updateAfterAddrVisibility();
      });
      list.appendChild(card);
    });
  }

  function updateAfterAddrVisibility(){
    const section = document.getElementById('detAfterAddrSection');
    if(!section) return;
    section.style.display = orderDetails.addressId ? 'block' : 'none';
  }

  function cartHasPlanItem(){
    return Object.values(cart).some(item => /plan|subscription|monthly|weekly/i.test(item.name || ''));
  }

  function renderDetailsScreen(){
    renderSavedAddrList();
    updateAfterAddrVisibility();
    document.getElementById('detPhone').value = orderDetails.phone;
    document.getElementById('detAltPhone').value = orderDetails.altPhone;
    document.getElementById('detNote').value = orderDetails.note;

    const skipBtn = document.getElementById('detSkipTomorrowBtn');
    if(skipBtn){
      skipBtn.classList.toggle('active', orderDetails.skipTomorrow);
      skipBtn.dataset.skip = orderDetails.skipTomorrow ? 'true' : 'false';
      skipBtn.textContent = orderDetails.skipTomorrow ? 'Skipped' : 'Skip';
    }

    const timingBlock = document.getElementById('detTimingBlock');
    pendingCartHasPlan = cartHasPlanItem();
    timingBlock.style.display = pendingCartHasPlan ? 'block' : 'none';

    document.querySelectorAll('.time-chip').forEach(chip=>{
      chip.classList.toggle('selected', chip.dataset.time === orderDetails.deliveryTime);
    });

    // If there's no address yet, auto-open the "add new" form so the user
    // isn't stuck looking at an empty list with nothing to do.
    if(savedAddresses.length === 0){
      document.getElementById('newAddrForm').style.display = 'block';
    }
  }

  // Skip-tomorrow button (rectangular, 5px radius — toggles on tap)
  const detSkipTomorrowBtn = document.getElementById('detSkipTomorrowBtn');
  if(detSkipTomorrowBtn) detSkipTomorrowBtn.addEventListener('click', ()=>{
    orderDetails.skipTomorrow = !orderDetails.skipTomorrow;
    detSkipTomorrowBtn.classList.toggle('active', orderDetails.skipTomorrow);
    detSkipTomorrowBtn.textContent = orderDetails.skipTomorrow ? 'Skipped' : 'Skip';
  });

  // Add new address toggle
  const addNewAddrBtn = document.getElementById('addNewAddrBtn');
  const newAddrForm = document.getElementById('newAddrForm');
  const cancelNewAddrBtn = document.getElementById('cancelNewAddrBtn');
  const saveNewAddrBtn = document.getElementById('saveNewAddrBtn');
  let pendingAddrCoords = null; // { lat, lng, accuracy, radius } captured from live location

  function resetNewAddrForm(){
    newAddrForm.style.display = 'none';
    document.getElementById('newAddrLabel').value = '';
    document.getElementById('newAddrBuilding').value = '';
    document.getElementById('newAddrFloor').value = '';
    document.getElementById('newAddrRoom').value = '';
    document.getElementById('newAddrFull').value = '';
    document.getElementById('detGeoStatus').style.display = 'none';
    document.getElementById('detGeoMap').style.display = 'none';
    pendingAddrCoords = null;
  }

  if(addNewAddrBtn) addNewAddrBtn.addEventListener('click', ()=>{
    newAddrForm.style.display = 'block';
    newAddrForm.scrollIntoView({ behavior:'smooth', block:'nearest' });
  });
  if(cancelNewAddrBtn) cancelNewAddrBtn.addEventListener('click', resetNewAddrForm);

  if(saveNewAddrBtn) saveNewAddrBtn.addEventListener('click', ()=>{
    const label = document.getElementById('newAddrLabel').value.trim();
    const building = document.getElementById('newAddrBuilding').value.trim();
    const floor = document.getElementById('newAddrFloor').value.trim();
    const room = document.getElementById('newAddrRoom').value.trim();
    const full = document.getElementById('newAddrFull').value.trim();

    if(!label){ showToast('Please add a label (Home, Work, Other)'); return; }
    if(!pendingAddrCoords){ showToast('Please share live location first'); return; }
    if(!building){ showToast('Please enter building / house name'); return; }
    if(!floor){ showToast('Please enter floor'); return; }
    if(!room){ showToast('Please enter room / flat no.'); return; }

    const fullDisplay = [
      `Room ${room}, Floor ${floor}`,
      building,
      full
    ].filter(Boolean).join(', ');

    const id = 'addr' + (savedAddresses.length + 1);
    savedAddresses.push({
      id, label, full: fullDisplay,
      building, floor, room,
      lat: pendingAddrCoords.lat,
      lng: pendingAddrCoords.lng,
      accuracy: pendingAddrCoords.accuracy,
      radius: pendingAddrCoords.radius
    });
    orderDetails.addressId = id;
    resetNewAddrForm();
    renderSavedAddrList();
    updateAfterAddrVisibility();
    showToast('Address saved — now add the rest of the details');
  });

  // "Share live location" inside the details form -> captures exact
  // GPS coordinates (not just the area name) and reverse-geocodes the
  // street/area/landmark text as a starting point the user can edit.
  const detUseLocBtn = document.getElementById('detUseLocBtn');
  const detGeoStatus = document.getElementById('detGeoStatus');
  const detGeoMap = document.getElementById('detGeoMap');
  let detLeafletMap = null;
  let detLeafletCircle = null;
  const ADDRESS_RADIUS_METERS = 50;

  function renderGeoMap(lat, lng){
    detGeoMap.style.display = 'block';
    if(!window.L){
      // Leaflet failed to load (offline/blocked) — status text above still shows accuracy.
      return;
    }
    if(!detLeafletMap){
      detLeafletMap = L.map(detGeoMap, { zoomControl:false, attributionControl:true }).setView([lat, lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(detLeafletMap);
      detLeafletMarker = L.marker([lat, lng]).addTo(detLeafletMap);
      detLeafletCircle = L.circle([lat, lng], {
        radius: ADDRESS_RADIUS_METERS,
        color: '#4CAF6D',
        fillColor: '#4CAF6D',
        fillOpacity: 0.15,
        weight: 2
      }).addTo(detLeafletMap);
    } else {
      detLeafletMap.setView([lat, lng], 17);
      detLeafletMarker.setLatLng([lat, lng]);
      detLeafletCircle.setLatLng([lat, lng]);
    }
    // Fit the view so the full 50m circle is visible
    detLeafletMap.fitBounds(detLeafletCircle.getBounds(), { padding:[16,16] });
    setTimeout(()=> detLeafletMap.invalidateSize(), 150);
  }
  let detLeafletMarker = null;

  if(detUseLocBtn) detUseLocBtn.addEventListener('click', ()=>{
    const btnText = document.getElementById('detUseLocBtnText');
    if(!navigator.geolocation){
      showToast('Geolocation not supported on this device');
      return;
    }
    detUseLocBtn.classList.add('loading');
    btnText.textContent = 'Fetching live location...';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    detUseLocBtn.prepend(spinner);

    navigator.geolocation.getCurrentPosition(async (pos)=>{
      const { latitude, longitude, accuracy } = pos.coords;
      pendingAddrCoords = { lat: latitude, lng: longitude, accuracy, radius: ADDRESS_RADIUS_METERS };

      const label = await reverseGeocode(latitude, longitude);
      document.getElementById('newAddrFull').value = label.replace(/<[^>]+>/g,'').replace('Current · ', '');
      if(!document.getElementById('newAddrLabel').value) document.getElementById('newAddrLabel').value = 'Current location';

      detGeoStatus.style.display = 'flex';
      detGeoStatus.innerHTML = `<span class="geo-dot"></span> Live location captured (±${Math.round(accuracy)}m GPS accuracy) &middot; ${ADDRESS_RADIUS_METERS}m delivery radius shown below`;
      renderGeoMap(latitude, longitude);

      detUseLocBtn.classList.remove('loading');
      btnText.textContent = 'Share live location';
      spinner.remove();
      document.getElementById('newAddrBuilding').focus();
    }, (err)=>{
      detUseLocBtn.classList.remove('loading');
      btnText.textContent = 'Share live location';
      spinner.remove();
      pendingAddrCoords = null;
      detGeoStatus.style.display = 'none';
      detGeoMap.style.display = 'none';
      showToast(err && err.code === 1 ? 'Location permission denied — turn it on to add an address' : 'Could not fetch live location, try again');
    }, { enableHighAccuracy:true, timeout:8000, maximumAge:0 });
  });

  // Delivery note quick chips (fills the textarea, still editable)
  document.querySelectorAll('#detNoteChips .det-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('#detNoteChips .det-chip').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      document.getElementById('detNote').value = chip.dataset.note;
    });
  });

  // Plan delivery time chips
  document.querySelectorAll('.time-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('.time-chip').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      orderDetails.deliveryTime = chip.dataset.time;
    });
  });

  // Save & Continue -> validates, stores everything together, moves to Payment
  const detContinueBtn = document.getElementById('detContinueBtn');
  if(detContinueBtn) detContinueBtn.addEventListener('click', ()=>{
    if(!orderDetails.addressId){
      showToast('Please add a delivery address first');
      return;
    }
    const phone = document.getElementById('detPhone').value.trim();
    const altPhone = document.getElementById('detAltPhone').value.trim();
    const note = document.getElementById('detNote').value.trim();
    // orderDetails.skipTomorrow is already kept in sync by the Skip button handler

    if(!/^\d{10}$/.test(phone)){
      showToast('Enter a valid 10-digit mobile number');
      return;
    }
    if(altPhone && !/^\d{10}$/.test(altPhone)){
      showToast('Alternate number should be 10 digits');
      return;
    }

    // Save everything at once
    orderDetails.phone = phone;
    orderDetails.altPhone = altPhone;
    orderDetails.note = note;

    const selectedAddr = savedAddresses.find(a => a.id === orderDetails.addressId);
    if(selectedAddr) setDeliveryAddress(`${selectedAddr.label} &middot; ${selectedAddr.full}`);

    // orderDetails is now the single object to send to the backend with the order:
    // { addressId, phone, altPhone, note, deliveryTime, skipTomorrow }
    goToScreen('payment');
  });

  /* =========================================================
     NAV FAB -> Cart, keep goToScreen wiring intact
  ========================================================= */
  // (navFab click listener already re-bound below to go to cart)

  /* =========================================================
     UX LOCKS: no pull-to-refresh reload, no long-press copy/select
  ========================================================= */
  (function(){
    // Block long-press context menu (copy/save-image popup) app-wide,
    // but still allow it inside inputs/textareas so users can paste.
    document.addEventListener('contextmenu', function(e){
      const tag = e.target.tagName;
      if(tag !== 'INPUT' && tag !== 'TEXTAREA'){
        e.preventDefault();
      }
    });

    // Block the browser's native pull-to-refresh gesture.
    // Strategy: if the user starts a touch at scrollTop 0 and drags down, cancel it.
    let touchStartY = 0;
    const appEl = document.getElementById('app');
    document.addEventListener('touchstart', function(e){
      if(e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive:true });

    document.addEventListener('touchmove', function(e){
      if(e.touches.length !== 1) return;
      const touchY = e.touches[0].clientY;
      const scroller = e.target.closest('.screen') || appEl;
      const atTop = !scroller || scroller.scrollTop <= 0;
      const pullingDown = touchY > touchStartY;
      if(atTop && pullingDown){
        e.preventDefault();
      }
    }, { passive:false });

    // Double-tap-to-zoom is already off via viewport meta, but iOS Safari can still
    // zoom on rapid double-tap; neutralize it without blocking normal double taps on buttons.
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(e){
      const now = Date.now();
      if(now - lastTouchEnd <= 300){
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive:false });
  })();

  /* =========================================================
     DELIVERY ETA STRIP: red > amber > green countdown + arrival ping
     Wire real values from backend order status; demo timer below
     shows how to drive it (call startDeliveryEta(etaMinutes) when
     an order flips to "out for delivery", call stopDeliveryEta()
     when delivered or no active order).
  ========================================================= */
  let etaIntervalId = null;
  let etaTargetTimestamp = null;
  let etaSoundPlayed = false;

  function etaBeep(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      o.start();
      o.stop(ctx.currentTime + 0.35);
    }catch(e){ /* audio not available */ }
  }

  function startDeliveryEta(etaMinutes){
    const strip = document.getElementById('etaStrip');
    const timeEl = document.getElementById('etaTime');
    if(!strip) return;

    etaTargetTimestamp = Date.now() + etaMinutes * 60000;
    etaSoundPlayed = false;
    strip.classList.add('show');

    function tick(){
      const msLeft = etaTargetTimestamp - Date.now();
      const minsLeft = Math.max(0, Math.ceil(msLeft / 60000));

      strip.classList.remove('red','amber','green');
      if(minsLeft > 30){
        strip.classList.add('red');
      } else if(minsLeft > 15){
        strip.classList.add('amber');
      } else {
        strip.classList.add('green');
      }
      timeEl.textContent = minsLeft > 0 ? (minsLeft + ' min') : 'Arrived';

      if(minsLeft <= 0 && !etaSoundPlayed){
        etaSoundPlayed = true;
        strip.classList.add('arrived');
        etaBeep();
        const overlay = document.getElementById('deliveryArrivedOverlay');
        if(overlay) overlay.classList.add('show');
        clearInterval(etaIntervalId);
      }
    }

    tick();
    clearInterval(etaIntervalId);
    etaIntervalId = setInterval(tick, 1000);
  }

  function stopDeliveryEta(){
    clearInterval(etaIntervalId);
    etaIntervalId = null;
    const strip = document.getElementById('etaStrip');
    if(strip){ strip.classList.remove('show','red','amber','green','arrived'); }
  }

  // expose for backend-driven calls later (e.g. after socket.io "order:outForDelivery" event)
  window.startDeliveryEta = startDeliveryEta;
  window.stopDeliveryEta = stopDeliveryEta;

  /* =========================================================
     LOGIN GATE: opened on-demand (not on app load).
     Triggers: guest taps Account, or guest taps checkout/buy-plan.
     Paths: Google Sign-In -> bind phone, OR phone number -> OTP.
     Real integration points:
       - Google: load https://accounts.google.com/gsi/client, replace
         mockGoogleSignIn() with google.accounts.id.initialize/prompt,
         send the credential JWT to POST /api/auth/google.
       - Phone: POST /api/auth/send-otp, then POST /api/auth/verify-otp.
  ========================================================= */
  function openLoginGate(onSuccess){
    pendingAuthAction = typeof onSuccess === 'function' ? onSuccess : null;
    document.getElementById('loginStepChoice').classList.add('active');
    document.getElementById('loginStepPhoneEntry').classList.remove('active');
    document.getElementById('loginStepOtp').classList.remove('active');
    document.getElementById('loginStepBindPhone').classList.remove('active');
    document.getElementById('loginGate').classList.add('show');
  }
  function closeLoginGate(){
    document.getElementById('loginGate').classList.remove('show');
    pendingAuthAction = null;
  }
  function completeLogin(){
    document.getElementById('loginGate').classList.remove('show');
    saveSession();
    showToast('Welcome, ' + (userSession.name || 'there') + '!');
    renderAccountScreen();
    if(pendingAuthAction){
      const action = pendingAuthAction;
      pendingAuthAction = null;
      action();
    }
  }
  function renderAccountScreen(){
    const loggedInView = document.getElementById('accountLoggedInView');
    const guestView = document.getElementById('accountGuestView');
    const settingsGroup = document.getElementById('accountSettingsGroup');
    if(!loggedInView) return;
    if(userSession.loggedIn){
      loggedInView.style.display = 'flex';
      guestView.style.display = 'none';
      settingsGroup.style.display = 'block';
      const accName = document.querySelector('.account-name');
      const accPhone = document.querySelector('.account-phone');
      const accAvatar = document.querySelector('.account-avatar');
      if(accName) accName.textContent = userSession.name || 'Pakka Doodhwala User';
      if(accPhone && userSession.phone) accPhone.textContent = '+91 ' + userSession.phone.slice(0,2) + 'xxxxxx' + userSession.phone.slice(-2);
      if(accAvatar) accAvatar.textContent = (userSession.name || 'U').charAt(0);
    } else {
      loggedInView.style.display = 'none';
      guestView.style.display = 'block';
      settingsGroup.style.display = 'none';
    }
  }

  const loginGateBack = document.getElementById('loginGateBack');
  if(loginGateBack) loginGateBack.addEventListener('click', closeLoginGate);

  // ---- Google path ----
  function mockGoogleSignIn(){
    // Swap for real Google Identity Services call:
    // google.accounts.id.initialize({ client_id: 'YOUR_CLIENT_ID', callback: (r) => handleGoogleCredential(r.credential) });
    // google.accounts.id.prompt();
    return Promise.resolve({ googleId: 'demo_google_id', email: 'user@gmail.com', name: 'Kittu Rathod' });
  }

  const googleSignInBtn = document.getElementById('googleSignInBtn');
  if(googleSignInBtn) googleSignInBtn.addEventListener('click', async ()=>{
    googleSignInBtn.disabled = true;
    googleSignInBtn.textContent = 'Signing in...';
    try{
      const profile = await mockGoogleSignIn();
      userSession.googleId = profile.googleId;
      userSession.email = profile.email;
      userSession.name = profile.name;
      if(userSession.phone){
        // Already bound a number previously in this session -> straight in
        userSession.loggedIn = true;
        completeLogin();
      } else {
        document.getElementById('loginStepChoice').classList.remove('active');
        document.getElementById('loginStepBindPhone').classList.add('active');
      }
    } catch(err){
      showToast('Google sign-in failed, please try again');
    } finally {
      googleSignInBtn.disabled = false;
      googleSignInBtn.textContent = 'Continue with Google';
    }
  });

  const bindPhoneContinueBtn = document.getElementById('bindPhoneContinueBtn');
  if(bindPhoneContinueBtn) bindPhoneContinueBtn.addEventListener('click', ()=>{
    const phone = document.getElementById('bindPhoneInput').value.trim();
    if(!/^\d{10}$/.test(phone)){
      showToast('Enter a valid 10-digit mobile number');
      return;
    }
    userSession.phone = phone;
    userSession.loggedIn = true;
    orderDetails.phone = phone; // pre-fill checkout contact number
    // Real integration point: POST { googleId, email, phone } to /api/auth/bind-phone
    completeLogin();
  });

  // ---- Phone + OTP path ----
  const phoneLoginStartBtn = document.getElementById('phoneLoginStartBtn');
  if(phoneLoginStartBtn) phoneLoginStartBtn.addEventListener('click', ()=>{
    document.getElementById('loginStepChoice').classList.remove('active');
    document.getElementById('loginStepPhoneEntry').classList.add('active');
  });

  let otpPendingPhone = null;

  const phoneLoginSendOtpBtn = document.getElementById('phoneLoginSendOtpBtn');
  if(phoneLoginSendOtpBtn) phoneLoginSendOtpBtn.addEventListener('click', ()=>{
    const phone = document.getElementById('phoneLoginInput').value.trim();
    if(!/^\d{10}$/.test(phone)){
      showToast('Enter a valid 10-digit mobile number');
      return;
    }
    otpPendingPhone = phone;
    // Real integration point: POST /api/auth/send-otp { phone }
    document.getElementById('otpSentSub').textContent = 'Enter the 4-digit code sent to +91 ' + phone;
    document.getElementById('loginStepPhoneEntry').classList.remove('active');
    document.getElementById('loginStepOtp').classList.add('active');
    document.querySelectorAll('.otp-box').forEach(b=> b.value = '');
    const firstBox = document.querySelector('.otp-box');
    if(firstBox) firstBox.focus();
    showToast('OTP sent (demo: enter any 4 digits)');
  });

  // Auto-advance between OTP boxes
  document.querySelectorAll('.otp-box').forEach((box, idx, all)=>{
    box.addEventListener('input', ()=>{
      box.value = box.value.replace(/\D/g,'').slice(0,1);
      if(box.value && all[idx+1]) all[idx+1].focus();
    });
    box.addEventListener('keydown', (e)=>{
      if(e.key === 'Backspace' && !box.value && all[idx-1]) all[idx-1].focus();
    });
  });

  const otpResendBtn = document.getElementById('otpResendBtn');
  if(otpResendBtn) otpResendBtn.addEventListener('click', ()=>{
    // Real integration point: POST /api/auth/send-otp { phone: otpPendingPhone } again
    showToast('OTP resent');
  });

  const otpVerifyBtn = document.getElementById('otpVerifyBtn');
  if(otpVerifyBtn) otpVerifyBtn.addEventListener('click', ()=>{
    const code = Array.from(document.querySelectorAll('.otp-box')).map(b=>b.value).join('');
    if(code.length !== 4){
      showToast('Enter the full 4-digit OTP');
      return;
    }
    // Real integration point: POST /api/auth/verify-otp { phone: otpPendingPhone, code }
    userSession.phone = otpPendingPhone;
    userSession.loggedIn = true;
    orderDetails.phone = otpPendingPhone;
    completeLogin();
  });

  // ---- Account screen: Login button (guest) + Log out ----
  const accountLoginBtn = document.getElementById('accountLoginBtn');
  if(accountLoginBtn) accountLoginBtn.addEventListener('click', ()=> openLoginGate());

  const accountLogoutRow = document.getElementById('accountLogoutRow');
  if(accountLogoutRow) accountLogoutRow.addEventListener('click', ()=>{
    clearSession();
    renderAccountScreen();
    showToast('Logged out');
    goToScreen('home');
  });

  // ---- Restore saved session on load; if none/invalid, guest browses freely.
  //      If admin has blocked the account, force back to guest + login gate. ----
  loadSession();
  (async function(){
    if(userSession.loggedIn){
      const blocked = await checkAccountBlocked();
      if(blocked){
        clearSession();
        renderAccountScreen();
        showToast('Your account has been blocked. Please contact support.');
        openLoginGate();
        return;
      }
    }
    renderAccountScreen();
  })();

  // ---- Gate: Account tab tap while logged out ----
  document.querySelectorAll('.nav-item[data-screen="account"]').forEach(item=>{
    item.addEventListener('click', (e)=>{
      if(!userSession.loggedIn){
        e.stopImmediatePropagation();
        openLoginGate(()=> goToScreen('account'));
      }
    }, true); // capture phase: run before the normal goToScreen('account') handler
  });

  /* =========================================================
     BACKGROUND LOCATION TRACKING (delivery-boy side scaffold)
     This customer app only needs to READ live delivery-boy location
     (via socket.io once backend exists). The functions below are the
     scaffold for the separate delivery-boy app/PWA, kept here so the
     pattern is documented in one place:
     - Foreground: navigator.geolocation.watchPosition (works in any browser tab)
     - Background (screen locked / app backgrounded): requires either
       a native wrapper (Capacitor/Cordova geolocation background plugin)
       or a installed PWA using periodic Background Sync + a server push;
       plain mobile browser tabs cannot reliably track location once
       backgrounded, so ship the delivery-boy app as an installed PWA
       or a thin native shell for this to work reliably.
  ========================================================= */
  let deliveryWatchId = null;

  function startForegroundLocationTracking(onUpdate){
    if(!navigator.geolocation){
      showToast('Geolocation not supported on this device');
      return;
    }
    deliveryWatchId = navigator.geolocation.watchPosition((pos)=>{
      const { latitude, longitude } = pos.coords;
      // Real integration: emit via socket.io, e.g.
      // socket.emit('deliveryBoy:location', { orderId, lat: latitude, lng: longitude });
      if(typeof onUpdate === 'function') onUpdate(latitude, longitude);
    }, (err)=>{
      showToast('Could not access live location');
    }, { enableHighAccuracy:true, maximumAge:5000, timeout:10000 });
  }

  function stopForegroundLocationTracking(){
    if(deliveryWatchId !== null){
      navigator.geolocation.clearWatch(deliveryWatchId);
      deliveryWatchId = null;
    }
  }

  window.startForegroundLocationTracking = startForegroundLocationTracking;
  window.stopForegroundLocationTracking = stopForegroundLocationTracking;

  /* =========================================================
     GLOBAL NOTIFICATIONS (shared by topbar bell + subscription bell)
  ========================================================= */
  const notifications = []; // {title, sub, kind, time}

  function pushNotification(n){
    notifications.unshift({
      title: n.title,
      sub: n.sub,
      kind: n.kind,
      time: n.time instanceof Date ? n.time : new Date()
    });
    renderNotifBadge();
  }

  function renderNotifBadge(){
    const count = notifications.length;
    const dot = document.getElementById('subBellDot');
    if(dot) dot.classList.toggle('show', count > 0);
    const topBadge = document.getElementById('topNotifBadge');
    if(topBadge){
      if(count > 0){
        topBadge.textContent = count > 9 ? '9+' : String(count);
        topBadge.style.display = 'flex';
      } else {
        topBadge.style.display = 'none';
      }
    }
  }

  function timeAgo(d){
    const mins = Math.round((Date.now() - d.getTime())/60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins/60);
    if(hrs < 24) return hrs + 'h ago';
    const days = Math.round(hrs/24);
    if(days < 7) return days + 'd ago';
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  }

  function iconFor(kind){
    if(kind === 'skip') return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>';
    if(kind === 'deliver') return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-dim)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    if(kind === 'order') return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--yellow-deep)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';
    if(kind === 'promo') return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--yellow-deep)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.2L4 3a1 1 0 0 0-1 1l.2 5.59a2 2 0 0 0 .58 1.4l9.6 9.6a2 2 0 0 0 2.82 0l4.4-4.4a2 2 0 0 0 0-2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--yellow-deep)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
  }

  function renderNotifList(){
    const list = document.getElementById('notifList');
    const empty = document.getElementById('notifEmpty');
    list.innerHTML = '';
    if(notifications.length === 0){
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    notifications.forEach(n=>{
      const row = document.createElement('div');
      row.className = 'notif-item';
      row.innerHTML = `
        <div class="notif-icon">${iconFor(n.kind)}</div>
        <div class="notif-text">
          <div class="notif-title">${n.title}</div>
          <div>${n.sub}</div>
          <div class="notif-time">${timeAgo(n.time)}</div>
        </div>`;
      list.appendChild(row);
    });
  }

  function openNotifPanel(){
    renderNotifList();
    document.getElementById('notifBackdrop').classList.add('show');
  }
  function ringBell(el){
    if(!el) return;
    el.classList.remove('ring');
    void el.offsetWidth;
    el.classList.add('ring');
  }

  document.getElementById('topNotifBtn').addEventListener('click', function(){
    ringBell(this);
    openNotifPanel();
  });
  document.getElementById('notifBackdrop').addEventListener('click', (e)=>{
    if(e.target.id === 'notifBackdrop') document.getElementById('notifBackdrop').classList.remove('show');
  });
  document.getElementById('notifCloseBtn').addEventListener('click', ()=>{
    document.getElementById('notifBackdrop').classList.remove('show');
  });

  // Seed with realistic starter notifications so the bell isn't empty on first load
  (function seedNotifications(){
    const now = Date.now();
    pushNotification({ title:'Order delivered', sub:'Your 1L Toned Milk was delivered at 6:52 AM', kind:'deliver', time:new Date(now - 45*60000) });
    pushNotification({ title:'Delivery boy on the way', sub:'Ravi is 10 minutes away with your order', kind:'order', time:new Date(now - 3*3600000) });
    pushNotification({ title:'Flat ₹50 off', sub:'Subscribe to any monthly plan and save ₹50 this week', kind:'promo', time:new Date(now - 20*3600000) });
    pushNotification({ title:'Payment received', sub:'₹899 received for Family Pack subscription', kind:'deliver', time:new Date(now - 26*3600000) });
    pushNotification({ title:'Plan renews in 3 days', sub:'Your Family Pack · Monthly renews soon — manage it anytime', kind:'renew', time:new Date(now - 30*3600000) });
    notifications.sort((a,b)=> b.time - a.time);
    renderNotifBadge();
  })();

  /* =========================================================
     SUBSCRIPTION MANAGEMENT (in-memory mock — no backend yet)
  ========================================================= */
  (function(){
    const CUTOFF_HOUR = 22; // 10 PM

    // ---- Mock plan state ----
    const planStart = new Date(); planStart.setDate(planStart.getDate() - 6); planStart.setHours(0,0,0,0);
    let planEnd = new Date(planStart); planEnd.setDate(planEnd.getDate() + 29);

    // day status: 'delivered' | 'skipped' | 'normal' (future, default)
    // key = 'YYYY-MM-DD'
    const dayStatus = {};

    function dkey(d){ return d.toISOString().slice(0,10); }
    function sameDay(a,b){ return dkey(a) === dkey(b); }
    function addDays(d,n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }
    function todayMid(){ const t = new Date(); t.setHours(0,0,0,0); return t; }

    // seed some history so the calendar isn't empty
    (function seed(){
      let d = new Date(planStart);
      const today = todayMid();
      while(d < today){
        dayStatus[dkey(d)] = (dkey(d) === dkey(addDays(today,-3))) ? 'skipped' : 'delivered';
        d = addDays(d,1);
      }
    })();

    function pastCutoff(){
      return new Date().getHours() >= CUTOFF_HOUR;
    }

    // The earliest date a user is allowed to change (respecting the 10PM cutoff)
    function earliestEditableDate(){
      const t = todayMid();
      return pastCutoff() ? addDays(t,2) : addDays(t,1);
    }

    let calViewMonth = new Date(todayMid().getFullYear(), todayMid().getMonth(), 1);

    function statOf(d){
      const key = dkey(d);
      const today = todayMid();
      if(d < today) return dayStatus[key] || 'delivered';
      if(sameDay(d, today)) return 'today';
      return dayStatus[key] || 'normal';
    }

    function renderCalendar(){
      const grid = document.getElementById('subCalGrid');
      const label = document.getElementById('subCalMonthLabel');
      label.textContent = calViewMonth.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
      grid.innerHTML = '';
      const firstOfMonth = new Date(calViewMonth);
      const startPad = firstOfMonth.getDay();
      const daysInMonth = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth()+1, 0).getDate();

      for(let i=0;i<startPad;i++){
        const pad = document.createElement('div');
        pad.className = 'sub-day empty';
        grid.appendChild(pad);
      }
      for(let dnum=1; dnum<=daysInMonth; dnum++){
        const d = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth(), dnum);
        const cell = document.createElement('div');
        cell.className = 'sub-day';
        cell.dataset.date = dkey(d);

        const inPlan = d >= planStart && d <= planEnd;
        const status = inPlan ? statOf(d) : null;
        const qtyTag = (inPlan && dayQty[dkey(d)]) ? `<div class="sub-day-qty">${dayQty[dkey(d)]}</div>` : '';

        if(!inPlan){
          cell.classList.add('locked');
          cell.innerHTML = `<span>${dnum}</span>`;
        } else if(status === 'today'){
          cell.classList.add('today','upcoming-normal');
          cell.innerHTML = `<span>${dnum}</span><div class="sub-day-dot" style="background:var(--yellow-deep);"></div>${qtyTag}`;
        } else if(status === 'delivered'){
          cell.classList.add('past-delivered');
          cell.innerHTML = `<span>${dnum}</span><div class="sub-day-dot"></div>${qtyTag}`;
        } else if(status === 'skipped'){
          cell.classList.add(d < todayMid() ? 'past-skipped' : 'upcoming-skip');
          cell.innerHTML = `<span>${dnum}</span><div class="sub-day-dot"></div>`;
        } else {
          cell.classList.add('upcoming-normal');
          cell.innerHTML = `<span>${dnum}</span>${qtyTag}`;
        }

        if(inPlan && d > todayMid()){
          cell.addEventListener('click', ()=> openAdjustSheet(d));
        } else if(!inPlan){
          // no click
        } else {
          cell.style.cursor = 'default';
        }
        grid.appendChild(cell);
      }
      renderPlanStats();
    }

    function renderPlanStats(){
      const today = todayMid();
      const daysLeft = Math.max(0, Math.round((planEnd - today) / 86400000));
      let delivered = 0, skipped = 0;
      let d = new Date(planStart);
      while(d <= planEnd){
        const s = statOf(d);
        if(s === 'delivered') delivered++;
        if(s === 'skipped' && d < today) skipped++;
        d = addDays(d,1);
      }
      document.getElementById('subDaysLeft').textContent = daysLeft;
      document.getElementById('subDelivered').textContent = delivered;
      document.getElementById('subSkipped').textContent = skipped;
      document.getElementById('subRenewDate').textContent = planEnd.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
      document.getElementById('renewDateInPopup').textContent = planEnd.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    }

    document.getElementById('subCalPrev').addEventListener('click', ()=>{
      calViewMonth = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth()-1, 1);
      renderCalendar();
    });
    document.getElementById('subCalNext').addEventListener('click', ()=>{
      calViewMonth = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth()+1, 1);
      renderCalendar();
    });

    /* ---------- Adjust bottom sheet ---------- */
    let adjustTargetDate = null;
    let adjustMode = 'deliver';
    let adjustSkipDays = 1;
    let customSkipDays = 4;
    const defaultQty = '1L';
    const dayQty = {}; // key = 'YYYY-MM-DD' -> '500ml' | '1L' (only set when changed from default)
    let adjustQty = defaultQty;

    function openAdjustSheet(d){
      adjustTargetDate = d;
      adjustMode = 'deliver';
      adjustSkipDays = 1;
      customSkipDays = 4;
      adjustQty = dayQty[dkey(d)] || defaultQty;

      document.getElementById('adjustModeDeliver').classList.add('active');
      document.getElementById('adjustModeSkip').classList.remove('active');
      document.getElementById('adjustSkipDaysBlock').style.display = 'none';
      document.getElementById('adjustCustomDaysBlock').style.display = 'none';
      document.querySelectorAll('.adjust-day-chip').forEach(c=>c.classList.remove('selected'));
      document.querySelector('.adjust-day-chip[data-days="1"]').classList.add('selected');
      document.getElementById('customDaysValue').textContent = customSkipDays;

      document.querySelectorAll('.adjust-qty-chip').forEach(c=>c.classList.toggle('selected', c.dataset.qty === adjustQty));

      const isTomorrow = sameDay(d, addDays(todayMid(),1));
      const label = isTomorrow ? "Tomorrow" : d.toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'short'});
      document.getElementById('adjustSheetTitle').textContent = `Adjust ${label}'s Delivery`;
      document.getElementById('adjustSheetSub').textContent = `${adjustQty} Toned Milk · scheduled for 7:00 AM`;

      // Only tomorrow is affected by the 10 PM cutoff — every other future day stays freely editable.
      const locked = isTomorrow && pastCutoff();
      document.getElementById('adjustLockedView').style.display = locked ? 'block' : 'none';
      document.getElementById('adjustStepChoice').style.display = locked ? 'none' : 'block';
      document.getElementById('adjustStepConfirm').style.display = 'none';

      document.getElementById('adjustSheetBackdrop').classList.add('show');
    }

    function closeAdjustSheet(){
      document.getElementById('adjustSheetBackdrop').classList.remove('show');
    }
    document.getElementById('adjustCancelBtn').addEventListener('click', closeAdjustSheet);
    document.getElementById('adjustLockedOk').addEventListener('click', closeAdjustSheet);
    document.getElementById('adjustSheetBackdrop').addEventListener('click', (e)=>{
      if(e.target.id === 'adjustSheetBackdrop') closeAdjustSheet();
    });

    document.getElementById('adjustModeDeliver').addEventListener('click', function(){
      adjustMode = 'deliver';
      this.classList.add('active');
      document.getElementById('adjustModeSkip').classList.remove('active');
      document.getElementById('adjustSkipDaysBlock').style.display = 'none';
      document.getElementById('adjustQtyBlock').style.display = 'block';
    });
    document.getElementById('adjustModeSkip').addEventListener('click', function(){
      adjustMode = 'skip';
      this.classList.add('active');
      document.getElementById('adjustModeDeliver').classList.remove('active');
      document.getElementById('adjustSkipDaysBlock').style.display = 'block';
      document.getElementById('adjustQtyBlock').style.display = 'none';
    });

    document.querySelectorAll('.adjust-qty-chip').forEach(chip=>{
      chip.addEventListener('click', function(){
        document.querySelectorAll('.adjust-qty-chip').forEach(c=>c.classList.remove('selected'));
        this.classList.add('selected');
        adjustQty = this.dataset.qty;
      });
    });

    function updateCustomPreview(){
      const endDate = addDays(adjustTargetDate, customSkipDays-1);
      document.getElementById('adjustRangePreview').textContent =
        `Skipping ${adjustTargetDate.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${endDate.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} (${customSkipDays} days). Plan end date moves to ${addDays(planEnd, customSkipDays).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}.`;
    }

    document.querySelectorAll('.adjust-day-chip').forEach(chip=>{
      chip.addEventListener('click', function(){
        document.querySelectorAll('.adjust-day-chip').forEach(c=>c.classList.remove('selected'));
        this.classList.add('selected');
        if(this.dataset.days === 'custom'){
          adjustSkipDays = customSkipDays;
          document.getElementById('adjustCustomDaysBlock').style.display = 'block';
          updateCustomPreview();
        } else {
          adjustSkipDays = parseInt(this.dataset.days, 10);
          document.getElementById('adjustCustomDaysBlock').style.display = 'none';
        }
      });
    });

    document.getElementById('customDaysMinus').addEventListener('click', ()=>{
      customSkipDays = Math.max(2, customSkipDays - 1);
      document.getElementById('customDaysValue').textContent = customSkipDays;
      adjustSkipDays = customSkipDays;
      updateCustomPreview();
    });
    document.getElementById('customDaysPlus').addEventListener('click', ()=>{
      customSkipDays = Math.min(14, customSkipDays + 1);
      document.getElementById('customDaysValue').textContent = customSkipDays;
      adjustSkipDays = customSkipDays;
      updateCustomPreview();
    });

    document.getElementById('adjustNextBtn').addEventListener('click', ()=>{
      const target = adjustTargetDate;
      const confirmTitle = document.getElementById('adjustConfirmStepTitle');
      const confirmSub = document.getElementById('adjustConfirmStepSub');

      if(adjustMode === 'deliver'){
        const dayLabel = sameDay(target, addDays(todayMid(),1)) ? 'Tomorrow\'s' : `${target.toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'short'})}'s`;
        confirmTitle.textContent = 'Confirm Delivery';
        confirmSub.textContent = `${dayLabel} ${adjustQty} Toned Milk will be delivered as usual at 7:00 AM. Swipe to confirm.`;
        document.getElementById('swipeLabel').textContent = 'Swipe to confirm';
      } else {
        const endDate = addDays(target, adjustSkipDays-1);
        const rangeLabel = adjustSkipDays === 1
          ? target.toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'short'})
          : `${target.toLocaleDateString('en-IN',{day:'numeric', month:'short'})} – ${endDate.toLocaleDateString('en-IN',{day:'numeric', month:'short'})}`;
        confirmTitle.textContent = adjustSkipDays === 1 ? 'Confirm Skip' : `Confirm ${adjustSkipDays}-Day Skip`;
        confirmSub.textContent = `No milk will be delivered on ${rangeLabel}. Your plan end date will move to ${addDays(planEnd, adjustSkipDays).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} to make up for it. Swipe to confirm.`;
        document.getElementById('swipeLabel').textContent = 'Swipe to skip';
      }

      document.getElementById('adjustStepChoice').style.display = 'none';
      document.getElementById('adjustStepConfirm').style.display = 'block';
      resetSwipe();
    });

    document.getElementById('adjustBackBtn').addEventListener('click', ()=>{
      document.getElementById('adjustStepConfirm').style.display = 'none';
      document.getElementById('adjustStepChoice').style.display = 'block';
    });

    /* ---------- Swipe-to-confirm slider ---------- */
    const swipeTrack = document.getElementById('swipeTrack');
    const swipeThumb = document.getElementById('swipeThumb');
    const swipeFill = document.getElementById('swipeFill');
    let swipeMax = 0, swipeStartX = 0, thumbStartLeft = 0, dragging = false;

    function resetSwipe(){
      swipeThumb.classList.add('snapping');
      swipeThumb.style.left = '3px';
      swipeFill.style.width = '0px';
      requestAnimationFrame(()=> swipeThumb.classList.remove('snapping'));
    }

    function computeSwipeMax(){
      swipeMax = swipeTrack.offsetWidth - swipeThumb.offsetWidth - 6;
    }

    function onDragStart(e){
      dragging = true;
      computeSwipeMax();
      swipeStartX = (e.touches ? e.touches[0].clientX : e.clientX);
      thumbStartLeft = swipeThumb.offsetLeft;
      swipeThumb.classList.remove('snapping');
      swipeThumb.style.cursor = 'grabbing';
    }
    function onDragMove(e){
      if(!dragging) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      let newLeft = thumbStartLeft + (x - swipeStartX);
      newLeft = Math.max(3, Math.min(swipeMax, newLeft));
      swipeThumb.style.left = newLeft + 'px';
      swipeFill.style.width = (newLeft + swipeThumb.offsetWidth) + 'px';
      if(newLeft >= swipeMax - 2){
        dragging = false;
        completeSwipe();
      }
    }
    function onDragEnd(){
      if(!dragging) return;
      dragging = false;
      swipeThumb.style.cursor = 'grab';
      const left = swipeThumb.offsetLeft;
      if(left < swipeMax - 2){
        resetSwipe();
      }
    }

    swipeThumb.addEventListener('mousedown', onDragStart);
    swipeThumb.addEventListener('touchstart', onDragStart, {passive:true});
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('touchmove', onDragMove, {passive:true});
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);

    function completeSwipe(){
      applyAdjustment();
    }

    function applyAdjustment(){
      const target = adjustTargetDate;
      const overlay = document.getElementById('adjustConfirmOverlay');
      const titleEl = document.getElementById('adjustConfirmTitle');
      const subEl = document.getElementById('adjustConfirmSub');

      if(adjustMode === 'skip'){
        for(let i=0; i<adjustSkipDays; i++){
          const d = addDays(target, i);
          dayStatus[dkey(d)] = 'skipped';
        }
        // Extend the plan end date by the number of skipped days so the user
        // still receives every delivery they paid for.
        planEnd = addDays(planEnd, adjustSkipDays);

        const endDate = addDays(target, adjustSkipDays-1);
        const rangeLabel = adjustSkipDays === 1
          ? target.toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'short'})
          : `${target.toLocaleDateString('en-IN',{day:'numeric', month:'short'})} – ${endDate.toLocaleDateString('en-IN',{day:'numeric', month:'short'})}`;
        titleEl.textContent = adjustSkipDays === 1 ? 'Delivery Skipped' : `${adjustSkipDays} Deliveries Skipped`;
        subEl.textContent = `No milk will be delivered on ${rangeLabel}. Your plan now runs until ${planEnd.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} to make up for it.`;
        pushNotification({
          title: adjustSkipDays === 1 ? 'Delivery skipped' : `${adjustSkipDays} days skipped`,
          sub: `Skipped: ${rangeLabel} · plan extended to ${planEnd.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`,
          kind: 'skip'
        });
      } else {
        dayStatus[dkey(target)] = 'normal';
        if(adjustQty === defaultQty){
          delete dayQty[dkey(target)];
        } else {
          dayQty[dkey(target)] = adjustQty;
        }
        titleEl.textContent = 'Delivery Confirmed';
        subEl.textContent = `Your ${target.toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'short'})} delivery (${adjustQty}) is confirmed.`;
        pushNotification({
          title: 'Delivery confirmed',
          sub: `${adjustQty} on ${target.toLocaleDateString('en-IN',{day:'numeric', month:'short'})}`,
          kind: 'deliver'
        });
      }

      closeAdjustSheet();
      overlay.classList.add('show');
      renderCalendar();
    }

    document.getElementById('adjustConfirmDone').addEventListener('click', ()=>{
      document.getElementById('adjustConfirmOverlay').classList.remove('show');
    });

    /* ---------- Renewal reminder popup ---------- */
    function maybeShowRenewalReminder(){
      const daysToRenew = Math.round((planEnd - todayMid()) / 86400000);
      if(daysToRenew <= 3 && daysToRenew >= 0){
        document.getElementById('renewBackdrop').classList.add('show');
      }
    }
    document.getElementById('renewLaterBtn').addEventListener('click', ()=>{
      document.getElementById('renewBackdrop').classList.remove('show');
      pushNotification({ title:'Renewal reminder snoozed', sub:'We\'ll remind you again tomorrow', kind:'renew' });
    });
    document.getElementById('renewConfirmBtn').addEventListener('click', ()=>{
      document.getElementById('renewBackdrop').classList.remove('show');
      planEnd.setDate(planEnd.getDate() + 30);
      renderPlanStats();
      showToast('Plan renewed for another 30 days');
      pushNotification({ title:'Plan renewed', sub:'Your Family Pack subscription now runs 30 more days', kind:'deliver' });
    });

    /* ---------- Init on screen entry ---------- */
    let subInitDone = false;
    document.getElementById('manageSubRow').addEventListener('click', function(){
      renderCalendar();
      if(!subInitDone){
        subInitDone = true;
        setTimeout(maybeShowRenewalReminder, 500);
      }
    });
  })();
