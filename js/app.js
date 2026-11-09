/* ==========================================================================
   Stealth Leviathan · app.js
   Shell (sidebar / topbar / mobile tab-bar), hash router, cross-view flows
   (claim, early-exit entry), settings (demo date, JSON export/import/reset).
   Data flow:  db.json → store (state) → engine (derived) → views (render)
               user action → SL.app.act() → store.dispatch() → re-render
   ========================================================================== */
window.SL = window.SL || {};

SL.app = (function () {
  const U = SL.util, E = SL.engine, UI = SL.ui, store = SL.store;
  const ROUTES = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'portfolio', label: 'Portfolio', icon: 'portfolio' },
    { id: 'deals', label: 'Deal Room', icon: 'deals' },
    { id: 'otc', label: 'OTC Desk', icon: 'otc' },
    { id: 'analytics', label: 'Analytics', icon: 'calendar', sub: 'Calendar · Treasury' }
  ];
  let current = 'overview';

  let emblemN = 0;
  /* each copy gets its own gradient id: a shared id breaks when the first copy sits in a hidden subtree */
  const emblemSvg = () => { const g = 'eg' + (++emblemN); return `<svg class="emblem" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DFA8"/><stop offset="1" stop-color="#9C7A3C"/></linearGradient></defs>
    <path d="M20 2l15.6 9v18L20 38 4.4 29V11z" fill="none" stroke="url(#${g})" stroke-width="1.6"/>
    <path d="M9 23c3.2-3.4 6.4-3.4 9.6 0s6.4 3.4 9.6 0c1.2-1.3 2.4-2 3.6-2.2M9 17.5c3.2-3.4 6.4-3.4 9.6 0" fill="none" stroke="url(#${g})" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="25.6" cy="14.4" r="1.4" fill="url(#${g})"/></svg>`; };

  /* ------------------------------ shell ------------------------------ */
  function shell() {
    const s = store.get(), k = E.kpis(s);
    const tierGem = `<svg viewBox="0 0 24 24" class="gem"><path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" opacity=".18"/><path d="M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 18 3-18" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
    U.$('#sidebar').innerHTML = `
      <a class="brand" href="#overview">${emblemSvg()}<span><b>STEALTH</b><i>LEVIATHAN</i></span></a>
      <nav class="side-nav">${ROUTES.map(r => `<a href="#${r.id}" class="${r.id === current ? 'on' : ''}">${UI.icons[r.icon]}<span>${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</span>${r.id === 'deals' ? `<em class="cnt">${s.projects.filter(p => E.dealStatus(s, p) === 'live').length}</em>` : ''}</a>`).join('')}</nav>
      <div class="member-card">
        <div class="mc-top">${tierGem}<div><span class="muted small">Membership</span><b>${s.user.tier} Tier</b></div></div>
        <div class="mc-row"><span class="muted">Member</span><b class="mono">${s.user.memberId}</b></div>
        <div class="mc-row"><span class="muted">Since</span><b>${U.fmtDate(s.user.joinedAt)}</b></div>
        <div class="mc-row"><span class="muted">Ticket range</span><b>${U.usd(s.user.tierLimits.min, { compact: true })} – ${U.usd(s.user.tierLimits.max, { compact: true })}+</b></div>
        <span class="invite">${UI.icons.shield} Invite-only syndicate</span>
        ${SL.auth.current(s) ? `<div class="mc-user"><span class="muted small" title="${U.esc(SL.auth.current(s).email)}">${U.esc(SL.auth.current(s).email)}</span><button class="link" data-logout>Sign out</button></div>` : ''}
      </div>`;
    U.$('#topbar').innerHTML = `
      <a class="brand mob" href="#overview">${emblemSvg()}<span><b>STEALTH</b><i>LEVIATHAN</i></span></a>
      <div class="tb-title"><span class="muted small">Stealth Leviathan /</span> <b>${ROUTES.find(r => r.id === current).label}</b></div>
      <div class="tb-right">
        <button class="asof" data-settings title="Demo date & data">${UI.icons.calendar}<span>As of ${U.fmtDate(E.now(s))}</span></button>
        <div class="bal"><span class="muted small">Liquid</span><b class="num">${U.usd(s.user.balances.USDT, { compact: true })} <small>USDT</small></b><b class="num">${U.usd(s.user.balances.USDC, { compact: true })} <small>USDC</small></b></div>
        <button class="wallet" data-wallet>
          <span class="w-dot"></span>
          <span class="w-main"><b>${U.esc(s.user.ens)}</b><small class="mono">${U.shortAddr(s.user.address)}</small></span>
          <span class="w-liq">${U.usd(s.user.balances.USDT + s.user.balances.USDC, { compact: true })}</span>
          <span class="w-badge">${s.user.wallet.type.split(' ')[0]} ${s.user.wallet.threshold}</span>
          <span class="tier">${tierGem}${s.user.tier}</span>
        </button>
        <button class="icon-btn" data-settings aria-label="Settings">${UI.icons.gear}</button>
        ${SL.auth.current(s) ? `<button class="icon-btn" data-logout aria-label="Sign out" title="Sign out">${UI.icons.logout}</button>` : ''}
      </div>`;
    U.$('#tabbar').innerHTML = ROUTES.map(r => `<a href="#${r.id}" class="${r.id === current ? 'on' : ''}">${UI.icons[r.icon]}<span>${r.label.replace(' Desk', '').replace('Deal Room', 'Deals')}</span></a>`).join('');
    document.querySelectorAll('[data-settings]').forEach(b => b.addEventListener('click', openSettings));
    document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', logout));
    U.$('[data-wallet]').addEventListener('click', openWallet);
  }

  function render() {
    const s = store.get();
    SL.charts.hideTip();
    shell();
    const root = U.$('#view');
    SL.views[current].render(root, s);
    document.title = `${SL.views[current].title} · Stealth Leviathan`;
  }

  function route() {
    const h = (location.hash || '').replace('#', '');
    const next = ROUTES.find(r => r.id === h) ? h : 'overview';
    const changed = next !== current;
    current = next;
    render();
    if (changed) window.scrollTo({ top: 0 });
  }

  /* ------------------------------ actions ------------------------------ */
  function act(type, payload) {
    const res = store.dispatch(type, payload);
    UI.toast(res);
    return res;
  }

  function claimAllFlow() {
    const s = store.get();
    const lots = E.allPositions(s).filter(m => m.claimable >= 1);
    if (!lots.length) return UI.toast({ ok: false, msg: 'Nothing claimable' });
    signModal('Claim all vested tokens', lots, () => act('CLAIM_ALL'));
  }
  function claimProjectFlow(projectId) {
    const s = store.get();
    const lots = E.allPositions(s).filter(m => m.project.id === projectId && m.claimable >= 1);
    if (!lots.length) return UI.toast({ ok: false, msg: 'Nothing claimable' });
    signModal(`Claim ${lots[0].project.ticker}`, lots, () => {
      let last; lots.forEach(l => (last = store.dispatch('CLAIM', { positionId: l.pos.id })));
      UI.toast(lots.length > 1 ? { ok: true, msg: `Claimed ${lots.length} lots of ${lots[0].project.ticker}` } : last);
    });
  }
  function signModal(title, lots, onConfirm) {
    const s = store.get(), total = lots.reduce((a, l) => a + l.claimableUsd, 0);
    UI.modal({
      title, width: 480,
      body: `<ul class="list">${lots.map(l => `<li class="li">${UI.logo(l.project, 30)}<div class="li-main"><b>${U.num(l.claimable)} ${l.project.ticker}</b><span class="muted">${l.pos.source === 'otc' ? 'OTC lot' : 'Primary lot'} · @ ${U.price(l.price)}</span></div><b class="num">${U.usd(l.claimableUsd)}</b></li>`).join('')}</ul>
        <div class="calc"><div class="calc-row total"><span>Total to wallet</span><b class="num">${U.usd(total)}</b></div>
        <div class="calc-row"><span>Destination</span><b class="mono">${U.esc(s.user.ens)} · ${U.shortAddr(s.user.address)}</b></div>
        <div class="calc-row"><span>Signers required</span><b>${s.user.wallet.type} ${s.user.wallet.threshold}</b></div></div>
        <div class="row end gap mt"><button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="sg-go">Sign & Claim</button></div>`,
      onMount(m, close) { m.querySelector('#sg-go').addEventListener('click', () => { close(); onConfirm(); }); }
    });
  }
  function startExit(projectId) {
    const s = store.get();
    const lot = E.allPositions(s).filter(m => m.project.id === projectId && m.locked >= 1).sort((a, b) => b.locked - a.locked)[0];
    const v = SL.views.otc.ui;
    v.market = projectId; v.side = 'sell'; v.positionId = lot ? lot.pos.id : null; v.limit = null;
    v.usd = lot ? Math.min(20000, Math.floor(lot.locked * E.markPrice(s, projectId))) : 0;
    if (current === 'otc') render(); else location.hash = 'otc';
  }

  /* ------------------------------ wallet / settings ------------------------------ */
  function openWallet() {
    const s = store.get(), k = E.kpis(s);
    UI.modal({
      title: 'Connected Wallet', width: 460,
      body: `<div class="wallet-card"><span class="w-dot"></span><div><b>${U.esc(s.user.ens)}</b><div class="mono small muted">${s.user.address}</div></div></div>
        <div class="calc">
          <div class="calc-row"><span>Type</span><b>${s.user.wallet.type} · ${s.user.wallet.threshold} signers</b></div>
          <div class="calc-row"><span>Network</span><b>${s.user.wallet.chain}</b></div>
          <div class="calc-row"><span>USDT</span><b class="num">${U.usd(s.user.balances.USDT, { dp: 2 })}</b></div>
          <div class="calc-row"><span>USDC</span><b class="num">${U.usd(s.user.balances.USDC, { dp: 2 })}</b></div>
          <div class="calc-row"><span>Escrowed (pledges + bids)</span><b class="num">${U.usd(k.escrowPledges + k.escrowBids)}</b></div>
          <div class="calc-row"><span>Tier</span><b>${s.user.tier} · ${s.user.memberId}</b></div>
        </div>
        <div class="row end gap mt"><button class="btn ghost" id="w-copy">${UI.icons.copy} Copy address</button></div>`,
      onMount(m) {
        m.querySelector('#w-copy').addEventListener('click', () => {
          try { navigator.clipboard.writeText(s.user.address).then(() => UI.toast({ ok: true, msg: 'Address copied' }), () => UI.toast({ ok: false, msg: 'Clipboard blocked' })); }
          catch (e) { UI.toast({ ok: false, msg: 'Clipboard blocked' }); }
        });
      }
    });
  }

  function openSettings() {
    const s = store.get();
    UI.modal({
      title: 'Demo Controls & Data', width: 520,
      body: `
        <p class="muted small">All figures are derived from <span class="mono">data/db.json</span> by the engine. Edit that file to add deals, positions or orders — the session resets automatically when the file changes.</p>
        <label class="fld-l">Demo date (“as of”) — time-travel the vesting schedules</label>
        <div class="row gap"><input type="date" id="st-date" class="fld" value="${U.iso(E.now(s))}"><button class="btn ghost" id="st-date-go">Apply</button></div>
        <div class="quick">${[-90, -30, 30, 90, 180].map(d => `<button class="chip-btn" data-shift="${d}">${d > 0 ? '+' : ''}${d}d</button>`).join('')}</div>
        <hr class="sep">
        ${SL.auth.current(s) ? `<label class="fld-l">Signed in</label><div class="row between"><b>${U.esc(SL.auth.current(s).email)}</b><button class="btn danger-ghost sm" id="st-out">Sign out</button></div><hr class="sep">` : ''}
        <label class="fld-l">Session state (JSON)</label>
        <div class="row gap wrap">
          <button class="btn ghost" id="st-copy">${UI.icons.copy} Copy JSON</button>
          <button class="btn ghost" id="st-dl">Download db.json</button>
          <label class="btn ghost file">Import JSON<input type="file" id="st-imp" accept=".json,application/json" hidden></label>
          <button class="btn danger-ghost" id="st-reset">Reset to db.json</button>
        </div>
        <p class="muted small mt">Export captures every pledge, claim, exit and order you made in this session — drop it back in as <span class="mono">data/db.json</span> to make it the new baseline.</p>`,
      onMount(m, close) {
        const setDate = d => { act('SET_ASOF', { date: d }); close(); };
        m.querySelector('#st-date-go').addEventListener('click', () => setDate(m.querySelector('#st-date').value));
        m.querySelectorAll('[data-shift]').forEach(b => b.addEventListener('click', () => setDate(U.iso(U.addDays(E.now(s), +b.dataset.shift)))));
        m.querySelector('#st-copy').addEventListener('click', () => {
          try { navigator.clipboard.writeText(store.exportJSON()).then(() => UI.toast({ ok: true, msg: 'State JSON copied' }), () => UI.toast({ ok: false, msg: 'Clipboard blocked' })); }
          catch (e) { UI.toast({ ok: false, msg: 'Clipboard blocked' }); }
        });
        m.querySelector('#st-dl').addEventListener('click', () => {
          try {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
            a.download = 'db.json'; document.body.appendChild(a); a.click(); a.remove();
          } catch (e) { UI.toast({ ok: false, msg: 'Download blocked here — use Copy JSON' }); }
        });
        m.querySelector('#st-imp').addEventListener('change', e => {
          const f = e.target.files[0]; if (!f) return;
          f.text().then(txt => { try { store.importJSON(JSON.parse(txt)); UI.toast({ ok: true, msg: 'JSON imported' }); close(); } catch (err) { UI.toast({ ok: false, msg: 'Invalid JSON: ' + err.message }); } });
        });
        m.querySelector('#st-out')?.addEventListener('click', () => { close(); logout(); });
        m.querySelector('#st-reset').addEventListener('click', () => { store.reset(); UI.toast({ ok: true, msg: 'Session reset to db.json' }); close(); });
      }
    });
  }

  /* ------------------------------ boot ------------------------------ */
  async function start() {
    try { await store.load('data/db.json'); }
    catch (e) {
      // file:// or missing server → let the user pick db.json manually
      U.$('#view').innerHTML = `<div class="boot-err card"><h2>Load data</h2><p class="muted">Could not fetch <span class="mono">data/db.json</span> (${U.esc(e.message)}). Serve the folder (e.g. <span class="mono">python3 -m http.server</span>) or pick the file:</p><label class="btn gold file">Select db.json<input type="file" accept=".json" hidden id="boot-file"></label></div>`;
      U.$('#boot-file').addEventListener('change', ev => ev.target.files[0].text().then(txt => { store.boot(txt); gate(); }));
      return;
    }
    gate();
  }
  /* members-only: no session → login screen, nothing else is rendered */
  function gate() {
    if (SL.auth.required(store.get()) && !SL.auth.current(store.get())) return showLogin();
    document.body.classList.remove('locked');
    U.$('#login').innerHTML = '';
    init();
  }
  let booted = false;
  function init() {
    if (booted) { route(); return; }
    booted = true;
    store.subscribe(() => { if (!document.body.classList.contains('locked')) render(); });
    window.addEventListener('hashchange', () => { if (!document.body.classList.contains('locked')) route(); });
    // re-render charts on width changes only (mobile keyboards change height and must not steal focus)
    let rt, lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastW) < 24) return;
      lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(() => { if (!document.body.classList.contains('locked')) render(); }, 160);
    });
    route();
    document.body.classList.add('ready');
  }

  function showLogin(note) {
    SL.charts.hideTip();
    document.querySelectorAll('.modal-wrap').forEach(m => m.remove());
    document.body.classList.remove('no-scroll');
    document.body.classList.add('locked');
    U.$('#view').innerHTML = ''; U.$('#sidebar').innerHTML = ''; U.$('#topbar').innerHTML = ''; U.$('#tabbar').innerHTML = '';
    document.title = 'Members Access · Stealth Leviathan';
    const s = store.get();
    const feat = (icon, t, d) => `<li><span class="kpi-ic">${UI.icons[icon]}</span><div><b>${t}</b><span>${d}</span></div></li>`;
    U.$('#login').innerHTML = `
      <div class="login">
        <section class="login-art" aria-hidden="true">
          <div class="login-water">${emblemSvg()}</div>
          <a class="brand">${emblemSvg()}<span><b>STEALTH</b><i>LEVIATHAN</i></span></a>
          <div class="login-copy">
            <p class="eyebrow">Private Whale Syndicate · Est. 2021</p>
            <h2 class="display">The deep end of <em>private markets.</em></h2>
            <p class="muted">Invite-only allocations in early-stage rounds, a tokenised vesting ledger and a members-only OTC desk for locked rights.</p>
            <ul class="login-feat">
              ${feat('deals', 'Opt-in allocations', 'Pick the deals you want, size your own ticket.')}
              ${feat('calendar', 'Vesting ledger', 'Every unlock, claim and cash-flow on one timeline.')}
              ${feat('otc', 'Stealth OTC desk', 'Exit early or collect discounted rights from members.')}
            </ul>
          </div>
          <p class="login-foot muted small">${s.treasury.membersCount} members · $50k – $1M+ tickets · Settlement via Safe multisig</p>
        </section>
        <section class="login-panel">
          <form class="login-card" id="lg-form" novalidate autocomplete="on">
            <a class="brand mob-only">${emblemSvg()}<span><b>STEALTH</b><i>LEVIATHAN</i></span></a>
            <p class="eyebrow">Members Access</p>
            <h1 class="display">Sign <em>in</em></h1>
            <p class="muted">Use the credentials issued by your syndicate lead.</p>
            ${note ? `<div class="note">${UI.icons.shield}<span>${U.esc(note)}</span></div>` : ''}
            <label class="fld-l" for="lg-email">Email</label>
            <div class="in-ic"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
              <input class="fld" id="lg-email" type="email" inputmode="email" autocomplete="username" placeholder="you@company.com" required></div>
            <label class="fld-l" for="lg-pass">Password</label>
            <div class="in-ic"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
              <input class="fld" id="lg-pass" type="password" autocomplete="current-password" placeholder="••••••••••" required>
              <button type="button" class="eye" id="lg-eye" aria-label="Show password"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
            <div class="row between login-row">
              <label class="check sm"><input type="checkbox" id="lg-rem"><span>Remember this device</span></label>
              <span class="muted small">Forgot access? Contact your lead.</span>
            </div>
            <div class="err" id="lg-err" hidden></div>
            <button class="btn gold block lg" id="lg-go" type="submit">Enter the Syndicate</button>
            <p class="login-sec muted small">${UI.icons.shield} Encrypted session · auto sign-out after ${(s.auth && s.auth.sessionHours) || 12}h</p>
          </form>
        </section>
      </div>`;
    const f = U.$('#lg-form'), em = U.$('#lg-email'), pw = U.$('#lg-pass'), err = U.$('#lg-err'), go = U.$('#lg-go');
    U.$('#lg-eye').addEventListener('click', () => { pw.type = pw.type === 'password' ? 'text' : 'password'; U.$('#lg-eye').classList.toggle('on'); });
    const showErr = m => { err.textContent = m; err.hidden = false; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); };
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!em.value.trim() || !pw.value) return showErr('Enter your email and password');
      go.disabled = true; go.textContent = 'Verifying…';
      const r = await SL.auth.login(store.get(), em.value, pw.value, U.$('#lg-rem').checked);
      if (!r.ok) {
        go.disabled = false; go.textContent = 'Enter the Syndicate'; pw.value = ''; showErr(r.msg);
        if (r.locked) { go.disabled = true; const t = setInterval(() => { const w = SL.auth.lockedFor(); if (!w) { clearInterval(t); go.disabled = false; err.hidden = true; } else err.textContent = `Too many attempts. Try again in ${w}s.`; }, 1000); }
        return;
      }
      if (!location.hash) location.hash = 'overview';
      gate();
      UI.toast({ ok: true, msg: `Welcome back, ${r.user.name || r.user.email}` });
    });
    setTimeout(() => em.focus(), 50);
  }
  function logout() {
    SL.auth.logout();
    showLogin('You have been signed out.');
  }

  return { start, render, act, claimAllFlow, claimProjectFlow, startExit, logout };
})();

document.addEventListener('DOMContentLoaded', SL.app.start);
