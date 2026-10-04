/* =========================================================
   ACCOUNT HUB
   Profile, Wallet, Addresses, Settings and Notifications screens,
   plus the redesigned Account dashboard.

   Loaded as a classic script right after script.js so it can read
   script.js's top-level state (userSession, savedAddresses via
   window.PD_ADDR, wishlist via window.PD_WISHLIST, ...). It never
   re-implements auth, orders or address storage: it reads them and
   calls the existing helpers.

   Backend reality (checked in js/api.js):
     - /users/me and PUT /users/me (name, email) ........ real
     - addresses ........ stored on this device (script.js)
     - wallet ........ NO backend yet -> see walletService below
========================================================= */
(function () {
  'use strict';

  /* ---------------- Icons (one stroke width / size everywhere) ---------------- */
  var ICONS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
    wallet: '<path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2Z"/><circle cx="17" cy="14" r="1"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    receipt: '<path d="M5 2h14v20l-3.5-2-3.5 2-3.5-2L5 22Z"/><path d="M9 8h6M9 12h6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m2.5 6 9.5 7 9.5-7"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }
  function paintIcons(root) {
    (root || document).querySelectorAll('.ic[data-ic]').forEach(function (el) {
      if (el.dataset.painted) return;
      el.innerHTML = svg(el.dataset.ic);
      el.dataset.painted = '1';
    });
  }

  /* ---------------- Small helpers ---------------- */
  var DEFAULT_NAME = 'Pakka Doodhwala User';
  function $(id) { return document.getElementById(id); }
  function esc(v) { return (window.escapeHtml || function (x) { return String(x == null ? '' : x); })(v); }
  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }
  function session() { return (typeof userSession !== 'undefined') ? userSession : { loggedIn: false }; }
  function go(name) { if (typeof window.goToScreen === 'function') window.goToScreen(name); }
  function activeScreen() { var a = document.querySelector('.screen.active'); return a ? a.id.replace('screen-', '') : ''; }
  function setText(name, value) {
    document.querySelectorAll('[data-bind="' + name + '"]').forEach(function (el) { el.textContent = value; });
  }
  function formatINR(n) {
    return '\u20B9' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatDate(d) {
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function displayName() {
    var n = (session().name || '').trim();
    return n && n !== DEFAULT_NAME ? n : '';
  }
  function initials(name) {
    var parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }
  function phoneFull(p) {
    if (!p) return '';
    var d = String(p).replace(/\D/g, '');
    if (d.length === 10) return '+91 ' + d.slice(0, 5) + ' ' + d.slice(5);
    return String(p);
  }
  function phoneMasked(p) {
    if (!p) return '';
    var d = String(p).replace(/\D/g, '');
    if (d.length === 10) return '+91 ' + d.slice(0, 2) + 'xxxxxx' + d.slice(-2);
    return String(p);
  }
  function avatarUrl() {
    var d = profile.data || {};
    var u = d.avatar || d.avatarUrl || d.picture || d.photo || d.image;
    return (typeof u === 'string' && /^https:\/\//.test(u)) ? u : '';
  }

  /* ---------------- Back navigation ---------------- */
  var stack = [];
  var current = 'home';
  var goingBack = false;
  window.addEventListener('pd:screen', function (e) {
    var name = e.detail && e.detail.name;
    if (!name) return;
    if (!goingBack && name !== current) {
      stack.push(current);
      if (stack.length > 20) stack.shift();
    }
    goingBack = false;
    current = name;
    if (name !== 'details') detailsReturn = null;
    onScreen(name);
  });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-back]');
    if (!btn) return;
    var target = stack.pop();
    if (!target || target === current) target = btn.dataset.back || 'account';
    goingBack = true;
    go(target);
  });

  /* ---------------- Profile data (GET /users/me, cached) ---------------- */
  var profile = { data: null, status: 'idle', at: 0 };

  function loadProfile(force) {
    var real = window.PD_REAL_AUTH;
    if (!session().loggedIn || !real || !real.fetchMyProfile) return;
    if (profile.status === 'loading') return;
    if (!force && profile.status === 'ready' && Date.now() - profile.at < 60000) return;
    profile.status = 'loading';
    renderProfileState();
    real.fetchMyProfile().then(function (u) {
      profile.data = u || {};
      profile.status = 'ready';
      profile.at = Date.now();
    }).catch(function () {
      profile.status = 'error';
    }).then(function () { render(); });
  }

  function renderProfileState() {
    var box = $('profileState');
    if (!box) return;
    if (profile.status === 'loading') {
      box.style.display = 'block';
      box.className = 'profile-state loading';
      box.textContent = 'Loading your account details\u2026';
    } else if (profile.status === 'error') {
      box.style.display = 'block';
      box.className = 'profile-state error';
      box.innerHTML = '<span>Couldn\u2019t load all account details.</span> <button type="button" class="link-btn" data-action="retry-profile">Retry</button>';
    } else {
      box.style.display = 'none';
    }
  }

  /* ---------------- Order stats (cheap fetch, never touches the orders list) ---------------- */
  var orderStats = null;
  var statsAt = 0;
  var ACTIVE = ['placed', 'preparing', 'pending_acceptance', 'out'];
  function computeStats(list) {
    if (!Array.isArray(list)) return null;
    return {
      total: list.length,
      active: list.filter(function (o) { return ACTIVE.indexOf(o.status) !== -1; }).length,
      delivered: list.filter(function (o) { return o.status === 'delivered'; }).length
    };
  }
  function loadOrderStats(force) {
    var ro = window.PD_REAL_ORDERS;
    if (!session().loggedIn || !ro || !ro.fetchMyOrders) return;
    if (!force && orderStats && Date.now() - statsAt < 30000) return;
    statsAt = Date.now();
    ro.fetchMyOrders().then(function (list) {
      orderStats = computeStats(list);
      render();
    }).catch(function () { /* keep previous counts; Account still renders */ });
  }
  function statsFromLoadedOrders() {
    if (typeof myOrders === 'undefined') return;
    var s = computeStats(myOrders);
    if (s) { orderStats = s; statsAt = Date.now(); render(); }
  }

  // De-dupe overlapping renderOrderHistory() calls (nav tap + Account row +
  // screen event) and refresh the summary tiles when a render finishes.
  (function wrapOrders() {
    var orig = window.renderOrderHistory;
    if (typeof orig !== 'function') return;
    var inflight = null;
    window.renderOrderHistory = function (live) {
      if (live !== undefined) return orig.call(this, live);
      if (inflight) return inflight;
      inflight = Promise.resolve(orig.call(this)).then(function () {
        inflight = null; statsFromLoadedOrders();
      }, function () { inflight = null; });
      return inflight;
    };
  })();

  /* =========================================================
     WALLET SERVICE  (isolated integration point)
     ---------------------------------------------------------
     The backend has no wallet routes. Until it does, this service
     reports 'unavailable' and NEVER invents a balance, a transaction
     or a successful top-up.
     To go live:  1) build /api/wallet routes (see walletApi in js/api.js)
                  2) set BACKEND_READY = true
                  3) implement startTopUp(): create a top-up order on the
                     server, open the payment gateway, verify server-side,
                     then reload(). Credit only after the server confirms.
  ========================================================= */
  var walletService = {
    BACKEND_READY: false,
    LIMITS: { min: 10, max: 50000 }, // placeholder - align with the backend rules
    state: { status: 'unavailable', balance: 0, txns: [] }, // unavailable | loading | ready | error
    load: function () {
      var self = this;
      if (!this.BACKEND_READY || !window.PD_WALLET) {
        this.state = { status: 'unavailable', balance: 0, txns: [] };
        return Promise.resolve(this.state);
      }
      this.state.status = 'loading';
      return Promise.all([window.PD_WALLET.get(), window.PD_WALLET.transactions()]).then(function (r) {
        self.state = { status: 'ready', balance: Number(r[0] && r[0].balance) || 0, txns: Array.isArray(r[1]) ? r[1] : [] };
        return self.state;
      }).catch(function () {
        self.state = { status: 'error', balance: 0, txns: [] };
        return self.state;
      });
    },
    startTopUp: function (amount) {
      if (!this.BACKEND_READY) return Promise.resolve({ ok: false, reason: 'not_integrated' });
      // TODO(wallet backend): createTopUp(amount) -> gateway -> verify -> this.load()
      return Promise.resolve({ ok: false, reason: 'not_integrated' });
    }
  };
  window.PD_WALLET_SERVICE = walletService;

  /* ---------------- Rendering: shared bindings ---------------- */
  function profileCompletion() {
    var s = session();
    var hasAddr = !!(window.PD_ADDR && window.PD_ADDR.list().length);
    var checks = [
      { ok: !!displayName(), hint: 'Add your name' },
      { ok: !!(s.email && s.email.trim()), hint: 'Add your email' },
      { ok: !!s.phone, hint: 'Add your mobile number' },
      { ok: hasAddr, hint: 'Save a delivery address' }
    ];
    var done = checks.filter(function (c) { return c.ok; }).length;
    var missing = checks.filter(function (c) { return !c.ok; })[0];
    return { pct: Math.round(done / checks.length * 100), hint: missing ? missing.hint + ' to complete your profile' : 'Your profile is complete' };
  }

  function defaultAddress() {
    if (!window.PD_ADDR) return null;
    var list = window.PD_ADDR.list();
    var id = window.PD_ADDR.selectedId();
    return list.filter(function (a) { return a.id === id; })[0] || list[0] || null;
  }

  function render() {
    var s = session();
    if (!s.loggedIn) return;
    var name = displayName();
    var email = (s.email || '').trim();

    setText('name', name || 'Add your name');
    setText('phone', phoneMasked(s.phone));
    setText('phoneFull', phoneFull(s.phone) || '\u2014');
    setText('email', email);
    setText('emailOrDash', email || '\u2014');

    // Avatar: real image if the profile exposes one, otherwise initials.
    var url = avatarUrl();
    document.querySelectorAll('[data-avatar]').forEach(function (el) {
      if (url) {
        el.innerHTML = '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer">';
        var img = el.firstChild;
        img.onerror = function () { el.textContent = initials(name); };
      } else {
        el.textContent = initials(name);
      }
    });

    var c = profileCompletion();
    setText('pct', c.pct + '%');
    setText('pcthint', c.hint);
    var bar = document.querySelector('[data-bind="pctbar"]');
    if (bar) bar.style.width = c.pct + '%';
    var track = bar && bar.parentNode;
    if (track) { track.setAttribute('role', 'progressbar'); track.setAttribute('aria-valuenow', c.pct); track.setAttribute('aria-valuemin', 0); track.setAttribute('aria-valuemax', 100); }

    // Verification: only shown when the backend actually says so.
    var d = profile.data || {};
    var verified = d.phoneVerified === true || d.verified === true || d.isVerified === true;
    document.querySelectorAll('[data-bind="verified"]').forEach(function (el) { el.style.display = verified ? 'inline-flex' : 'none'; });

    // Delivery
    var addrs = window.PD_ADDR ? window.PD_ADDR.list() : [];
    var def = defaultAddress();
    setText('defaultAddr', def ? (def.label + ' \u00B7 ' + def.full) : 'No address saved yet');
    setText('addrCount', String(addrs.length));
    setText('addrSub', addrs.length ? (addrs.length === 1 ? '1 saved address' : addrs.length + ' saved addresses') : 'Add a delivery address');
    setText('locSub', def ? (def.label + ' \u00B7 ' + def.full) : 'Set your delivery location');

    // Account info (only what the backend returns)
    var created = d.createdAt ? new Date(d.createdAt) : null;
    setText('since', created && !isNaN(created) ? created.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '\u2014');
    var cid = d._id || d.id;
    setText('custId', cid ? '#' + String(cid).slice(-8).toUpperCase() : '\u2014');
    setText('status', d.status ? String(d.status).charAt(0).toUpperCase() + String(d.status).slice(1) : (s.blocked ? 'Blocked' : 'Active'));
    setText('signin', s.googleId ? 'You\u2019re signed in with your Google account, so there is no password to manage.' : 'You sign in with a one-time code sent to your mobile, so there is no password to manage.');

    // Quick actions / counts
    var wishCount = Object.keys(window.PD_WISHLIST || {}).length;
    setText('wishVal', String(wishCount));
    setText('wishSub', wishCount ? wishCount + (wishCount === 1 ? ' saved product' : ' saved products') : 'No saved products yet');
    var pill = $('wishCountPill');
    if (pill) { pill.textContent = wishCount; pill.style.display = wishCount ? 'inline-flex' : 'none'; }

    var hasSub = typeof window.hasActiveSubscription === 'function' ? window.hasActiveSubscription() : false;
    setText('subVal', hasSub ? 'Active' : 'None');
    setText('subSub', hasSub ? 'Active milk plan' : 'No active plan');

    if (orderStats) {
      setText('ordersVal', String(orderStats.total));
      setText('ordersSub', orderStats.total + (orderStats.total === 1 ? ' order' : ' orders') + (orderStats.active ? ' \u00B7 ' + orderStats.active + ' active' : ''));
      var sumEl = $('ordersSummary');
      if (sumEl) sumEl.style.display = orderStats.total ? 'flex' : 'none';
      if ($('ordStatTotal')) $('ordStatTotal').textContent = orderStats.total;
      if ($('ordStatActive')) $('ordStatActive').textContent = orderStats.active;
      if ($('ordStatDelivered')) $('ordStatDelivered').textContent = orderStats.delivered;
    }

    var ws = walletService.state;
    setText('walletVal', ws.status === 'ready' ? '\u20B9' + Math.round(ws.balance) : '\u20B90');
    setText('walletSub', ws.status === 'ready' ? formatINR(ws.balance) + ' available' : 'Balance & transactions');

    var unread = unreadCount();
    setText('notifSub', unread ? unread + ' unread' : 'You\u2019re all caught up');

    renderProfileState();
    if (activeScreen() === 'addresses') renderAddresses();
  }

  /* =========================================================
     Screen entry
  ========================================================= */
  function onScreen(name) {
    if (!session().loggedIn && ['account', 'profile', 'wallet', 'addresses', 'settings'].indexOf(name) !== -1) return;
    switch (name) {
      case 'account': render(); loadProfile(); loadOrderStats(); walletService.load().then(render); break;
      case 'profile': render(); loadProfile(true); break;
      case 'wallet': renderWallet(true); break;
      case 'addresses': renderAddresses(); break;
      case 'settings': render(); break;
      case 'notifications': renderNotifs(); break;
      case 'wishlist': if (typeof renderWishlistScreen === 'function') renderWishlistScreen(); render(); break;
      case 'orders': if (typeof window.renderOrderHistory === 'function') window.renderOrderHistory(); loadOrderStats(); break;
      case 'subscription': if (typeof window.renderSubscriptionScreen === 'function') window.renderSubscriptionScreen(); break;
      case 'paymethods': renderPayMethods(); break;
    }
  }

  /* ---------------- Payment methods (visual hierarchy only; no card storage) ---------------- */
  function renderPayMethods() {
    var list = $('payAvailList');
    if (list && !list.dataset.done && typeof PAY_METHOD_META !== 'undefined') {
      list.innerHTML = ['upi', 'card', 'wallet', 'cod'].map(function (k) {
        var m = PAY_METHOD_META[k];
        return '<div class="hub-row static"><span class="hub-row-ic">' + m.icon + '</span><span class="hub-row-text"><b>' + esc(m.label) + '</b><small>' + esc(m.sub) + '</small></span></div>';
      }).join('');
      list.dataset.done = '1';
      paintIcons();
    }
    if (typeof window.renderPaymentMethodsScreen === 'function') window.renderPaymentMethodsScreen();
    var empty = $('payMethodsEmpty'), used = $('payUsedLabel');
    if (used && empty) used.style.display = empty.style.display === 'none' ? 'block' : 'none';
  }

  /* =========================================================
     WALLET SCREEN
  ========================================================= */
  var showAllTxns = false;
  function renderWallet(reload) {
    var st = walletService.state;
    var skeleton = $('walletSkeleton'), bal = $('walletBalance');
    var notice = $('walletNotice');
    var empty = $('walletEmpty'), err = $('walletError'), listEl = $('walletTxnList'), head = $('walletTxnHead');

    function paint() {
      var s = walletService.state;
      skeleton.style.display = s.status === 'loading' ? 'block' : 'none';
      bal.style.display = s.status === 'loading' ? 'none' : 'block';
      bal.textContent = formatINR(s.status === 'ready' ? s.balance : 0);

      notice.style.display = s.status === 'unavailable' ? 'flex' : 'none';
      if (s.status === 'unavailable') {
        notice.className = 'notice';
        notice.innerHTML = '<span class="ic">' + svg('info') + '</span><span>Wallet top-ups aren\u2019t available yet. Your balance and transactions will appear here once the wallet is switched on.</span>';
      }

      var info = $('walletInfo');
      if (info) info.style.display = s.status === 'ready' ? 'block' : 'none'; // only claim checkout use once the wallet is real
      err.style.display = s.status === 'error' ? 'flex' : 'none';
      var hasTx = s.status === 'ready' && s.txns.length > 0;
      head.style.display = hasTx ? 'flex' : 'none';
      listEl.innerHTML = hasTx ? renderTxns(s.txns) : '';
      var showEmpty = (s.status === 'ready' || s.status === 'unavailable') && !hasTx;
      empty.style.display = showEmpty ? 'flex' : 'none';
      render();
    }

    if (reload) {
      walletService.state.status = walletService.BACKEND_READY ? 'loading' : walletService.state.status;
      paint();
      walletService.load().then(paint);
    } else {
      paint();
    }
  }

  function txnStatus(t) {
    var st = String(t.status || 'success').toLowerCase();
    if (st === 'pending' || st === 'processing') return 'pending';
    if (st === 'failed' || st === 'failure') return 'failed';
    return 'success';
  }
  function renderTxns(txns) {
    var sorted = txns.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var shown = showAllTxns ? sorted : sorted.slice(0, 5);
    var html = '<div class="hub-group">' + shown.map(function (t) {
      var credit = String(t.type).toLowerCase() === 'credit';
      var status = txnStatus(t);
      var amt = (credit ? '+' : '\u2212') + formatINR(t.amount).replace('.00', '');
      return '<div class="txn ' + (credit ? 'credit' : 'debit') + ' ' + status + '">' +
        '<span class="txn-ic">' + svg(credit ? 'down' : 'up') + '</span>' +
        '<span class="txn-main"><b>' + esc(t.title || (credit ? 'Wallet Recharge' : 'Order Payment')) + '</b>' +
        '<small>' + esc(formatDate(t.createdAt)) + (t.ref ? ' \u00B7 Ref ' + esc(t.ref) : '') + '</small></span>' +
        '<span class="txn-side"><b class="txn-amt">' + amt + '</b>' +
        (status !== 'success' ? '<span class="status-pill ' + status + '">' + (status === 'pending' ? 'Pending' : 'Failed') + '</span>' : '') +
        '</span></div>';
    }).join('') + '</div>';
    if (sorted.length > 5) {
      html += '<button type="button" class="hub-ghost-btn wide" data-action="toggle-txns">' + (showAllTxns ? 'Show less' : 'View all (' + sorted.length + ')') + '</button>';
    }
    return html;
  }

  /* ---------------- Add money sheet ---------------- */
  var QUICK_AMOUNTS = [100, 200, 500, 1000];
  var lastFocus = null;

  function openSheet(el, focusEl) {
    lastFocus = document.activeElement;
    el.classList.add('show');
    if (focusEl) setTimeout(function () { focusEl.focus(); }, 60);
  }
  function closeSheet(el) {
    el.classList.remove('show');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }

  function openAddMoney() {
    var chips = $('addMoneyChips');
    chips.innerHTML = QUICK_AMOUNTS.map(function (a) {
      return '<button type="button" class="amount-chip" data-amt="' + a + '" aria-pressed="false">\u20B9' + a.toLocaleString('en-IN') + '</button>';
    }).join('');
    $('addMoneyInput').value = '';
    $('addMoneyErr').textContent = '';
    $('addMoneyStepPick').style.display = 'block';
    $('addMoneyStepResult').style.display = 'none';
    $('addMoneyContinueBtn').disabled = false;
    $('addMoneyContinueText').textContent = 'Continue to Payment';
    openSheet($('addMoneyBackdrop'), $('addMoneyInput'));
  }
  function selectChip(amt) {
    document.querySelectorAll('#addMoneyChips .amount-chip').forEach(function (c) {
      var on = String(c.dataset.amt) === String(amt);
      c.classList.toggle('selected', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function continueAddMoney() {
    var raw = $('addMoneyInput').value.trim();
    var amt = Number(raw);
    var L = walletService.LIMITS;
    var errEl = $('addMoneyErr');
    if (!raw || !isFinite(amt) || amt % 1 !== 0 || amt < L.min || amt > L.max) {
      errEl.textContent = 'Enter a whole amount between \u20B9' + L.min.toLocaleString('en-IN') + ' and \u20B9' + L.max.toLocaleString('en-IN');
      $('addMoneyInput').focus();
      return;
    }
    errEl.textContent = '';
    var btn = $('addMoneyContinueBtn');
    btn.disabled = true;
    $('addMoneyContinueText').textContent = 'Please wait\u2026';
    walletService.startTopUp(amt).then(function (res) {
      btn.disabled = false;
      $('addMoneyContinueText').textContent = 'Continue to Payment';
      if (res && res.ok) { closeSheet($('addMoneyBackdrop')); renderWallet(true); toast('Wallet updated'); return; }
      $('addMoneyStepPick').style.display = 'none';
      $('addMoneyStepResult').style.display = 'block';
      $('addMoneyResultMsg').innerHTML = '<span class="ic">' + svg('info') + '</span><span><b>Payment integration required.</b> Wallet recharge isn\u2019t connected yet, so nothing was charged and no money was added to your wallet.</span>';
      $('addMoneyDoneBtn').focus();
    });
  }

  /* =========================================================
     ADDRESSES SCREEN (reuses script.js address storage + the
     checkout screen's GPS-capture form for adding)
  ========================================================= */
  function renderAddresses() {
    var list = $('addrScreenList'), empty = $('addrScreenEmpty');
    if (!list || !window.PD_ADDR) return;
    var addrs = window.PD_ADDR.list();
    var defId = defaultAddress() && defaultAddress().id;
    empty.style.display = addrs.length ? 'none' : 'flex';
    list.innerHTML = addrs.map(function (a) {
      var isDef = a.id === defId;
      return '<article class="addr-card' + (isDef ? ' is-default' : '') + '" data-id="' + esc(a.id) + '">' +
        '<div class="addr-head"><span class="hub-row-ic">' + svg('pin') + '</span>' +
        '<b class="addr-label">' + esc(a.label) + '</b>' + (isDef ? '<span class="badge-default">Default</span>' : '') + '</div>' +
        '<p class="addr-full">' + esc(a.full) + '</p>' +
        '<div class="addr-actions">' +
        (isDef ? '' : '<button type="button" class="addr-act" data-act="default">Set as default</button>') +
        '<button type="button" class="addr-act" data-act="edit">' + svg('edit') + 'Edit</button>' +
        '<button type="button" class="addr-act danger" data-act="delete">' + svg('trash') + '<span>Delete</span></button>' +
        '</div></article>';
    }).join('');
  }

  var editingAddrId = null;
  var detailsReturn = null;
  function addAddress() {
    detailsReturn = activeScreen() || 'addresses';
    if (typeof renderDetailsScreen === 'function') renderDetailsScreen();
    go('details');
    var btn = $('addNewAddrBtn');
    if (btn) setTimeout(function () { btn.click(); }, 0);
  }
  // Back from the checkout address form returns to where the user came from.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#screen-details .back-btn');
    if (b && detailsReturn) {
      e.stopImmediatePropagation();
      var t = detailsReturn; detailsReturn = null; goingBack = true; go(t);
    }
  }, true);

  /* =========================================================
     NOTIFICATIONS SCREEN (merges script.js's local list and the
     live socket list from js/notifications.js)
  ========================================================= */
  var READ_KEY = 'pd_notif_read_at';
  var notifFilter = 'all';
  var CATS = [['all', 'All'], ['orders', 'Orders'], ['offers', 'Offers'], ['subscription', 'Subscription'], ['account', 'Account']];

  function readAt() { try { return Number(localStorage.getItem(READ_KEY)) || 0; } catch (e) { return 0; } }
  function allNotifs() {
    var a = (window.PD_LOCAL_NOTIFICATIONS || []).concat(window.__liveNotifications || []);
    return a.slice().sort(function (x, y) { return new Date(y.time) - new Date(x.time); });
  }
  function catOf(n) {
    if (/^account/i.test(n.title || '')) return 'account';
    if (n.kind === 'promo') return 'offers';
    if (n.kind === 'renew') return 'subscription';
    return 'orders';
  }
  function unreadCount() {
    var r = readAt();
    return allNotifs().filter(function (n) { return new Date(n.time).getTime() > r; }).length;
  }
  function syncBadge() {
    var n = unreadCount();
    var dot = $('subBellDot');
    if (dot) dot.classList.toggle('show', n > 0);
    var top = $('topNotifBadge');
    if (top) { top.textContent = n > 9 ? '9+' : String(n); top.style.display = n > 0 ? 'flex' : 'none'; }
    if (session().loggedIn) setText('notifSub', n ? n + ' unread' : 'You\u2019re all caught up');
  }
  function renderNotifs() {
    var chips = $('notifChips'), list = $('notifScreenList'), empty = $('notifScreenEmpty');
    if (!chips) return;
    var r = readAt();
    var items = allNotifs();
    chips.innerHTML = CATS.map(function (c) {
      var on = notifFilter === c[0];
      return '<button type="button" role="tab" aria-selected="' + on + '" class="chip' + (on ? ' selected' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    var shown = notifFilter === 'all' ? items : items.filter(function (n) { return catOf(n) === notifFilter; });
    empty.style.display = shown.length ? 'none' : 'flex';
    var eTitle = empty.querySelector('.sub-empty-title');
    if (eTitle) eTitle.textContent = items.length && notifFilter !== 'all' ? 'Nothing here yet' : 'You\u2019re all caught up';
    var iconFn = (typeof iconFor === 'function') ? iconFor : function () { return svg('bell'); };
    var tAgo = (typeof timeAgo === 'function') ? timeAgo : function (d) { return formatDate(d); };
    list.innerHTML = shown.length ? '<div class="hub-group">' + shown.map(function (n) {
      var unread = new Date(n.time).getTime() > r;
      return '<div class="notif-row' + (unread ? ' unread' : '') + '">' +
        '<span class="notif-ic">' + iconFn(n.kind) + '</span>' +
        '<span class="notif-body"><b>' + esc(n.title) + '</b><span>' + esc(n.sub) + '</span><small>' + esc(tAgo(new Date(n.time))) + '</small></span>' +
        (unread ? '<span class="unread-dot" aria-label="Unread"></span>' : '') + '</div>';
    }).join('') + '</div>' : '';
    var n = unreadCount();
    var pill = $('notifUnreadPill');
    if (pill) { pill.textContent = n + ' new'; pill.style.display = n ? 'inline-flex' : 'none'; }
    var mark = $('notifMarkAllBtn');
    if (mark) mark.disabled = n === 0;
    syncBadge();
  }

  /* =========================================================
     Edit-profile modal helpers (called from script.js)
  ========================================================= */
  function prepareProfileModal() {
    var ph = $('editProfilePhone');
    if (ph) ph.value = phoneFull(session().phone) || '';
    setProfileErrors({ name: '', email: '', form: '' });
    var name = displayName();
    var url = avatarUrl();
    var av = document.querySelector('#editProfileBackdrop [data-avatar]');
    if (av && !url) av.textContent = initials(name);
  }
  function setProfileErrors(e) {
    var map = { name: 'editProfileNameErr', email: 'editProfileEmailErr', form: 'editProfileFormErr' };
    Object.keys(map).forEach(function (k) {
      var el = $(map[k]);
      if (el) el.textContent = e[k] || '';
    });
    var n = $('editProfileName'), m = $('editProfileEmail');
    if (n) n.setAttribute('aria-invalid', e.name ? 'true' : 'false');
    if (m) m.setAttribute('aria-invalid', e.email ? 'true' : 'false');
  }

  /* =========================================================
     Events (delegated once - no per-render listeners)
  ========================================================= */
  document.addEventListener('click', function (e) {
    var t = e.target;

    var actionEl = t.closest('[data-action]');
    if (actionEl) {
      switch (actionEl.dataset.action) {
        case 'edit-profile': if (typeof window.openEditProfile === 'function') window.openEditProfile(); break;
        case 'add-address': addAddress(); break;
        case 'open-location': if (typeof openLocModal === 'function') openLocModal(); break;
        case 'open-help':
          go('orders');
          setTimeout(function () { var c = document.querySelector('#screen-orders .help-support-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
          break;
        case 'logout': if (typeof window.forceLogout === 'function') window.forceLogout('Logged out'); break;
        case 'retry-profile': loadProfile(true); break;
        case 'toggle-txns': showAllTxns = !showAllTxns; renderWallet(false); break;
      }
      return;
    }

    // Wallet
    if (t.closest('#walletAddMoneyBtn') || t.closest('#walletEmptyAddBtn')) { openAddMoney(); return; }
    if (t.closest('#walletHistoryBtn')) {
      var target = $('walletTxnList').children.length ? $('walletTxnHead') : $('walletEmpty');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t.closest('#walletRetryBtn')) { renderWallet(true); return; }
    var chip = t.closest('#addMoneyChips .amount-chip');
    if (chip) { $('addMoneyInput').value = chip.dataset.amt; $('addMoneyErr').textContent = ''; selectChip(chip.dataset.amt); return; }
    if (t.closest('#addMoneyContinueBtn')) { continueAddMoney(); return; }
    if (t.closest('#addMoneyCancelBtn') || t.closest('#addMoneyDoneBtn') || t.id === 'addMoneyBackdrop') { closeSheet($('addMoneyBackdrop')); return; }

    // Addresses
    var act = t.closest('.addr-act');
    if (act) {
      var card = act.closest('.addr-card'); var id = card && card.dataset.id;
      if (!id || !window.PD_ADDR) return;
      if (act.dataset.act === 'default') { window.PD_ADDR.select(id); renderAddresses(); toast('Default address updated'); }
      else if (act.dataset.act === 'edit') {
        var a = window.PD_ADDR.list().filter(function (x) { return x.id === id; })[0];
        if (!a) return;
        editingAddrId = id;
        $('editAddrLabel').value = a.label || '';
        $('editAddrFull').value = a.full || '';
        $('editAddrErr').textContent = '';
        openSheet($('editAddrBackdrop'), $('editAddrLabel'));
      } else if (act.dataset.act === 'delete') {
        if (act.dataset.confirm === '1') { window.PD_ADDR.remove(id); renderAddresses(); }
        else {
          act.dataset.confirm = '1';
          act.querySelector('span').textContent = 'Tap again to confirm';
          setTimeout(function () { if (document.body.contains(act)) { act.dataset.confirm = ''; act.querySelector('span').textContent = 'Delete'; } }, 3000);
        }
      }
      return;
    }
    if (t.closest('#addrUseLocationBtn')) { if (typeof openLocModal === 'function') openLocModal(); return; }
    if (t.closest('#editAddrCancelBtn') || t.id === 'editAddrBackdrop') { closeSheet($('editAddrBackdrop')); return; }
    if (t.closest('#editAddrSaveBtn')) {
      var label = $('editAddrLabel').value.trim(), full = $('editAddrFull').value.trim();
      if (!label) { $('editAddrErr').textContent = 'Please enter a label'; return; }
      if (full.length < 5) { $('editAddrErr').textContent = 'Please enter the full address'; return; }
      if (window.PD_ADDR.update(editingAddrId, label, full)) {
        closeSheet($('editAddrBackdrop')); renderAddresses(); render(); toast('Address updated');
      }
      return;
    }

    // Notifications
    var cat = t.closest('#notifChips .chip');
    if (cat) { notifFilter = cat.dataset.cat; renderNotifs(); return; }
    if (t.closest('#notifMarkAllBtn')) {
      try { localStorage.setItem(READ_KEY, String(Date.now())); } catch (err) { /* storage unavailable */ }
      renderNotifs(); toast('All notifications marked as read');
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'addMoneyInput') {
      e.target.value = e.target.value.replace(/[^\d]/g, '').slice(0, 6);
      $('addMoneyErr').textContent = '';
      selectChip(e.target.value);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'addMoneyInput') { e.preventDefault(); continueAddMoney(); }
    if (e.key !== 'Escape') return;
    ['addMoneyBackdrop', 'editAddrBackdrop', 'editProfileBackdrop'].forEach(function (id) {
      var el = $(id);
      if (el && el.classList.contains('show')) {
        if (id === 'editProfileBackdrop') el.classList.remove('show'); else closeSheet(el);
      }
    });
  });
  // Tapping the dimmed area closes the profile sheet too (script.js already does this; Escape/focus is the addition).

  /* ---------------- Public surface used by script.js / app-init.js ---------------- */
  window.PD_HUB = {
    refresh: render,
    syncBadge: syncBadge,
    unreadCount: unreadCount,
    onNotificationsChanged: function () { syncBadge(); if (activeScreen() === 'notifications') renderNotifs(); },
    onAddressSaved: function () {
      render();
      if (detailsReturn) { var t = detailsReturn; detailsReturn = null; goingBack = true; go(t); }
    },
    prepareProfileModal: prepareProfileModal,
    setProfileErrors: setProfileErrors
  };

  // Local notifications pushed by script.js re-render the screen if it's open.
  var origPush = window.PD_LOCAL_NOTIFICATIONS;
  if (origPush && typeof origPush.unshift === 'function') {
    var _unshift = origPush.unshift.bind(origPush);
    origPush.unshift = function () { var r = _unshift.apply(null, arguments); setTimeout(function () { window.PD_HUB.onNotificationsChanged(); }, 0); return r; };
  }

  paintIcons();
  syncBadge();
  render();
})();
