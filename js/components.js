/* ==========================================================================
   Stealth Leviathan · components.js
   Reusable UI atoms: modal / bottom-sheet, toast, logo monogram, KPI card,
   badges, progress bars. Views compose these; they hold no state.
   ========================================================================== */
window.SL = window.SL || {};

SL.ui = (function () {
  const U = SL.util, C = SL.charts;

  /* ---------- toast ---------- */
  function toast(res) {
    const host = U.$('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (res.ok ? 'ok' : 'err');
    el.innerHTML = `<span class="toast-ic">${res.ok ? '✓' : '!'}</span><span>${U.esc(res.msg)}</span>`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, res.ok ? 3600 : 4800);
  }

  /* ---------- modal (bottom sheet on mobile) ---------- */
  function modal({ title, body, tone = '', width = 520, onMount }) {
    C.hideTip();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${tone}" role="dialog" aria-modal="true" style="--mw:${width}px">
        <div class="modal-grip"></div>
        <header class="modal-h"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></header>
        <div class="modal-b">${body}</div></div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = () => {
      wrap.classList.remove('in'); document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 220);
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    onMount && onMount(wrap.querySelector('.modal'), close);
    return close;
  }

  /* ---------- atoms ---------- */
  function logo(p, size = 40) {
    const col = C.seriesColor(p.colorSlot);
    return `<span class="logo" style="--c:${col};--s:${size}px"><span>${U.esc(p.ticker.slice(0, 2))}</span></span>`;
  }
  function statusBadge(status) {
    const map = { live: ['Live', 'live'], upcoming: ['Upcoming', 'soon'], vesting: ['Vesting', 'vest'], 'pre-tge': ['Pre-TGE', 'pre'], closed: ['Closed', 'off'] };
    const [l, c] = map[status] || [status, 'off'];
    return `<span class="badge ${c}">${c === 'live' ? '<i class="pulse"></i>' : ''}${l}</span>`;
  }
  function multChip(x) {
    const cls = x >= 1 ? 'up' : 'down';
    return `<span class="chip ${cls}">${x >= 1 ? '▲' : '▼'} ${U.mult(x)}</span>`;
  }
  function deltaText(v, fmt = n => U.usd(n, { sign: true })) {
    return `<span class="${v >= 0 ? 'pos' : 'neg'}">${fmt(v)}</span>`;
  }
  function kpi({ label, value, sub = '', accent = false, icon = '', foot = '', id = '' }) {
    return `<article class="kpi ${accent ? 'accent' : ''}" ${id ? `id="${id}"` : ''}>
      <div class="kpi-top"><span class="kpi-ic">${icon}</span><span class="kpi-l">${label}</span></div>
      <div class="kpi-v num">${value}</div>
      <div class="kpi-s">${sub}</div>${foot ? `<div class="kpi-f">${foot}</div>` : ''}</article>`;
  }
  /* unlocked/claimed/locked stacked progress */
  function vestBar(m) {
    const claimed = U.clamp(m.claimedPct, 0, 1), unl = U.clamp(m.unlockPct, 0, 1);
    return `<div class="vbar" title="Claimed ${U.pct(claimed)} · Claimable ${U.pct(unl - claimed)} · Locked ${U.pct(1 - unl)}">
      <span class="vb-claimed" style="width:${claimed * 100}%"></span><span class="vb-claim" style="width:${Math.max(0, unl - claimed) * 100}%"></span></div>
      <div class="vbar-legend"><span><i class="lg-claimed"></i>Claimed ${U.pct(claimed, 0)}</span><span><i class="lg-claim"></i>Claimable ${U.pct(Math.max(0, unl - claimed), 0)}</span><span><i class="lg-locked"></i>Locked ${U.pct(1 - unl, 0)}</span></div>`;
  }
  function progress(frac, cls = '') {
    return `<div class="pbar ${cls}"><span style="width:${U.clamp(frac, 0, 1) * 100}%"></span></div>`;
  }
  function countdown(toDate, fromDate) {
    const d = U.daysBetween(fromDate, toDate);
    if (d < 0) return 'ended';
    if (d === 0) return 'today';
    return d === 1 ? '1 day' : `${d} days`;
  }
  function empty(text) { return `<div class="empty">${text}</div>`; }

  const icons = {
    vault: '<svg viewBox="0 0 24 24"><path d="M4 6h16v13H4zM4 6l2-2h12l2 2M12 10v5M9.5 12.5h5"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16M6 15l4-4 3 3 5-6"/></svg>',
    profit: '<svg viewBox="0 0 24 24"><path d="M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3 4 1.2 4 3.2-1.8 3-4 3-4-1.1-4-3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5"/></svg>',
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/></svg>',
    deals: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    otc: '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>'
  };

  return { toast, modal, logo, statusBadge, multChip, deltaText, kpi, vestBar, progress, countdown, empty, icons };
})();
