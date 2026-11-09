/* ==========================================================================
   Stealth Leviathan · charts.js
   Dependency-free SVG charts (Recharts-like aesthetic): line + crosshair,
   stacked bars, donut, progress ring, order-book depth, simple bars.
   Each chart reads its container width, so re-rendering = responsive.
   ========================================================================== */
window.SL = window.SL || {};

SL.charts = (function () {
  const U = SL.util;
  const NS = 'http://www.w3.org/2000/svg';
  let tipEl = null;

  /* Validated categorical series (dark surface) — color follows the entity. */
  const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  const seriesColor = slot => SERIES[((slot || 1) - 1) % SERIES.length];

  /* ---------- tooltip ---------- */
  function tip() {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showTip(evt, html) {
    const t = tip(); t.innerHTML = html; t.style.opacity = '1';
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y < 8) y = evt.clientY + pad;
    t.style.transform = `translate(${x}px, ${y}px)`;
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = '0'; }
  function row(color, label, value) {
    return `<div class="tip-row">${color ? `<i style="background:${color}"></i>` : ''}<span>${U.esc(label)}</span><b>${value}</b></div>`;
  }

  /* ---------- scales ---------- */
  function niceMax(v) {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * e;
  }
  function ticks(max, n = 4) { const out = []; for (let i = 0; i <= n; i++) out.push(max * i / n); return out; }
  function size(el, h) { const w = Math.max(260, el.clientWidth || el.getBoundingClientRect().width || 600); return { w, h }; }

  /* ===================================================================== */
  /* Line chart with crosshair                                              */
  /* ===================================================================== */
  function line(el, { labels, series, height = 240, fmt = v => U.usd(v, { compact: true }), area = 0 }) {
    const { w, h } = size(el, height);
    const m = { t: 16, r: 16, b: 28, l: 56 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const max = niceMax(Math.max(...series.flatMap(s => s.values)) * 1.08);
    const x = i => m.l + (labels.length === 1 ? iw / 2 : i * iw / (labels.length - 1));
    const y = v => m.t + ih - v / max * ih;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">`;
    svg += `<defs>${series.map((s, i) => `<linearGradient id="lg-${el.id}-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
    for (const t of ticks(max)) svg += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 10}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    const step = Math.ceil(labels.length / Math.max(2, Math.floor(iw / 64)));
    labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) svg += `<text class="axis" x="${x(i)}" y="${h - 8}" text-anchor="middle">${l}</text>`; });
    series.forEach((s, si) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      if (si === area) svg += `<path d="${d}L${x(s.values.length - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="url(#lg-${el.id}-${si})"/>`;
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      const li = s.values.length - 1;
      svg += `<circle cx="${x(li)}" cy="${y(s.values[li])}" r="4" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`;
    });
    svg += `<line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="opacity:0"/>`;
    svg += series.map((s, i) => `<circle class="xdot" data-s="${i}" r="5" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2" style="opacity:0"/>`).join('');
    svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.innerHTML = svg;
    const hit = el.querySelector('.hit'), xh = el.querySelector('.xhair'), dots = el.querySelectorAll('.xdot');
    const svgEl = el.querySelector('svg');
    hit.addEventListener('pointermove', e => {
      const r = svgEl.getBoundingClientRect(), px = (e.clientX - r.left) * (w / r.width);
      const i = U.clamp(Math.round((px - m.l) / iw * (labels.length - 1)), 0, labels.length - 1);
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.style.opacity = 1;
      dots.forEach(d => { const s = series[+d.dataset.s]; d.setAttribute('cx', x(i)); d.setAttribute('cy', y(s.values[i])); d.style.opacity = 1; });
      showTip(e, `<div class="tip-h">${labels[i]}</div>` + series.map(s => row(s.color, s.name, fmt(s.values[i]))).join(''));
    });
    hit.addEventListener('pointerleave', () => { xh.style.opacity = 0; dots.forEach(d => (d.style.opacity = 0)); hideTip(); });
  }

  /* ===================================================================== */
  /* Stacked bars (vesting calendar)                                        */
  /* ===================================================================== */
  function stacked(el, { buckets, keys, height = 260, selected, onSelect, fmt = v => U.usd(v, { compact: true }) }) {
    const { w, h } = size(el, height);
    const m = { t: 22, r: 8, b: 28, l: 52 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const max = niceMax(Math.max(1, ...buckets.map(b => b.total)) * 1.1);
    const bw = iw / buckets.length, barW = Math.min(36, bw * 0.62);
    const y = v => m.t + ih - v / max * ih;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">`;
    for (const t of ticks(max)) svg += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    buckets.forEach((b, i) => {
      const cx = m.l + bw * i + bw / 2, x0 = cx - barW / 2;
      let acc = 0;
      const segs = keys.filter(k => b.byProject[k.id] > 0);
      segs.forEach((k, si) => {
        const v = b.byProject[k.id], y1 = y(acc + v), y0 = y(acc);
        const gap = si > 0 ? 2 : 0;
        const hh = Math.max(1, y0 - y1 - gap);
        const top = si === segs.length - 1;
        svg += top
          ? `<path d="M${x0},${y0 - gap} V${y1 + 4} Q${x0},${y1} ${x0 + 4},${y1} H${x0 + barW - 4} Q${x0 + barW},${y1} ${x0 + barW},${y1 + 4} V${y0 - gap} Z" fill="${k.color}" class="${selected && selected !== b.key ? 'dim' : ''}"/>`
          : `<rect x="${x0}" y="${y0 - gap - hh}" width="${barW}" height="${hh}" fill="${k.color}" class="${selected && selected !== b.key ? 'dim' : ''}"/>`;
        acc += v;
      });
      if (b.total > 0 && (b.key === selected || (!selected && b.total === Math.max(...buckets.map(x => x.total)))))
        svg += `<text class="val" x="${cx}" y="${y(b.total) - 8}" text-anchor="middle">${fmt(b.total)}</text>`;
      svg += `<text class="axis ${b.key === selected ? 'sel' : ''}" x="${cx}" y="${h - 8}" text-anchor="middle">${U.fmtMonth(b.key)}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${m.l + bw * i}" y="${m.t}" width="${bw}" height="${ih + 20}" fill="transparent" style="cursor:pointer"/>`;
    });
    svg += '</svg>';
    el.innerHTML = svg;
    el.querySelectorAll('.hit').forEach(r => {
      const b = buckets[+r.dataset.i];
      r.addEventListener('pointermove', e => showTip(e, `<div class="tip-h">${U.fmtMonth(b.key, true)} unlocks</div>` +
        keys.filter(k => b.byProject[k.id]).map(k => row(k.color, k.label, U.usd(b.byProject[k.id]))).join('') +
        `<div class="tip-total">${row('', 'Total cash-flow', U.usd(b.total))}</div>`));
      r.addEventListener('pointerleave', hideTip);
      r.addEventListener('click', () => { hideTip(); onSelect && onSelect(b.key === selected ? null : b.key); });
    });
  }

  /* ===================================================================== */
  /* Donut                                                                  */
  /* ===================================================================== */
  function donut(el, { items, size: sz = 180, thickness = 18, center = '', sub = '' }) {
    const total = items.reduce((a, i) => a + i.value, 0) || 1;
    const r = sz / 2 - 4, c = sz / 2, gapA = 0.025;
    let a0 = -Math.PI / 2, svg = `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" role="img">`;
    items.forEach((it, i) => {
      const a = it.value / total * Math.PI * 2;
      const s = a0 + (items.length > 1 ? gapA : 0), e = a0 + a - (items.length > 1 ? gapA : 0);
      const ri = r - thickness;
      const p = (ang, rad) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
      const large = e - s > Math.PI ? 1 : 0;
      svg += `<path data-i="${i}" class="dseg" d="M${p(s, r)} A${r},${r} 0 ${large} 1 ${p(e, r)} L${p(e, ri)} A${ri},${ri} 0 ${large} 0 ${p(s, ri)} Z" fill="${it.color}"/>`;
      a0 += a;
    });
    svg += `<text x="${c}" y="${c - 2}" text-anchor="middle" class="donut-c">${center}</text><text x="${c}" y="${c + 16}" text-anchor="middle" class="donut-s">${sub}</text></svg>`;
    el.innerHTML = svg;
    el.querySelectorAll(".dseg").forEach(sEl => {
      const it = items[+sEl.dataset.i];
      sEl.addEventListener('pointermove', e => showTip(e, row(it.color, it.label, `${U.usd(it.value)} · ${U.pct(it.value / total)}`)));
      sEl.addEventListener('pointerleave', hideTip);
    });
  }

  /* ===================================================================== */
  /* Progress ring (returns markup)                                         */
  /* ===================================================================== */
  function ring(frac, { size: sz = 56, stroke = 5, color = 'var(--gold)', inner = null, sub = null, claimed = null } = {}) {
    const r = (sz - stroke) / 2, C = 2 * Math.PI * r, f = U.clamp(frac, 0, 1);
    const cf = claimed != null ? U.clamp(claimed, 0, f) : null;
    return `<svg class="ring" viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}">
      <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${(C * f).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${sz / 2} ${sz / 2})" ${cf != null ? 'opacity=".45"' : ''}/>
      ${cf != null ? `<circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(C * cf).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${sz / 2} ${sz / 2})"/>` : ''}
      <text x="50%" y="${sub ? '47%' : '50%'}" dominant-baseline="middle" text-anchor="middle" class="ring-t">${inner ?? Math.round(f * 100) + '%'}</text>
      ${sub ? `<text x="50%" y="66%" dominant-baseline="middle" text-anchor="middle" class="ring-s">${sub}</text>` : ''}
    </svg>`;
  }

  /* ===================================================================== */
  /* Order-book depth                                                       */
  /* ===================================================================== */
  function depth(el, { bids, asks, spot, height = 200 }) {
    const { w, h } = size(el, height);
    const m = { t: 14, r: 12, b: 26, l: 48 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const B = bids.slice().sort((a, b) => b.price - a.price), A = asks.slice().sort((a, b) => a.price - b.price);
    let cb = 0; const bc = B.map(b => ({ p: b.price, v: (cb += b.tokens * b.price) }));
    let ca = 0; const ac = A.map(a => ({ p: a.price, v: (ca += a.tokens * a.price) }));
    const prices = [...B.map(b => b.price), ...A.map(a => a.price), spot];
    const lo = Math.min(...prices) * 0.985, hi = Math.max(...prices) * 1.01;
    const max = niceMax(Math.max(cb, ca, 1) * 1.1);
    const x = p => m.l + (p - lo) / (hi - lo) * iw, y = v => m.t + ih - v / max * ih;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">`;
    for (const t of ticks(max, 3)) svg += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${U.usd(t, { compact: true })}</text>`;
    const stepPath = (pts, dir) => {
      if (!pts.length) return '';
      let d = `M${x(pts[0].p)},${y(0)}`;
      let prevV = 0;
      for (const pt of pts) { d += ` L${x(pt.p)},${y(prevV)} L${x(pt.p)},${y(pt.v)}`; prevV = pt.v; }
      const edge = dir < 0 ? m.l : w - m.r;
      d += ` L${edge},${y(prevV)} L${edge},${y(0)} Z`;
      return d;
    };
    svg += `<path d="${stepPath(bc, -1)}" fill="var(--bid)" fill-opacity=".18" stroke="var(--bid)" stroke-width="2"/>`;
    svg += `<path d="${stepPath(ac, 1)}" fill="var(--ask)" fill-opacity=".16" stroke="var(--ask)" stroke-width="2"/>`;
    svg += `<line x1="${x(spot)}" x2="${x(spot)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--gold)" stroke-dasharray="3 4" stroke-width="1.5"/>`;
    svg += `<text class="axis gold" x="${Math.min(x(spot), w - m.r - 4)}" y="${m.t + 10}" text-anchor="end">Spot ${U.price(spot)} </text>`;
    [lo, (lo + hi) / 2, hi].forEach(p => (svg += `<text class="axis" x="${x(p)}" y="${h - 8}" text-anchor="middle">${U.price(p)}</text>`));
    svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.innerHTML = svg;
    const svgEl = el.querySelector('svg');
    el.querySelector('.hit').addEventListener('pointermove', e => {
      const r = svgEl.getBoundingClientRect(), px = (e.clientX - r.left) * (w / r.width);
      const p = lo + (px - m.l) / iw * (hi - lo);
      const bidCum = B.filter(b => b.price >= p).reduce((a, b) => a + b.tokens * b.price, 0);
      const askCum = A.filter(a => a.price <= p).reduce((a, b) => a + b.tokens * b.price, 0);
      showTip(e, `<div class="tip-h">@ ${U.price(p)} · ${U.pct(p / spot - 1, 1, true)} vs spot</div>` + row('var(--bid)', 'Bid depth ≥ price', U.usd(bidCum)) + row('var(--ask)', 'Ask depth ≤ price', U.usd(askCum)));
    });
    el.querySelector('.hit').addEventListener('pointerleave', hideTip);
  }

  /* ===================================================================== */
  /* Simple bars (treasury inflows)                                         */
  /* ===================================================================== */
  function bars(el, { labels, values, height = 200, color = 'var(--gold)', fmt = v => U.usd(v, { compact: true }), tipLabel = 'Value', highlight = -1, extra }) {
    const { w, h } = size(el, height);
    const m = { t: 20, r: 8, b: 26, l: 50 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const max = niceMax(Math.max(1, ...values) * 1.1);
    const bw = iw / values.length, barW = Math.min(28, bw * 0.6);
    const y = v => m.t + ih - v / max * ih;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">`;
    for (const t of ticks(max, 3)) svg += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    values.forEach((v, i) => {
      const cx = m.l + bw * i + bw / 2, x0 = cx - barW / 2, y1 = y(v), y0 = y(0);
      const hh = Math.max(0, y0 - y1);
      const r = Math.min(4, hh);
      svg += `<path d="M${x0},${y0} V${y1 + r} Q${x0},${y1} ${x0 + r},${y1} H${x0 + barW - r} Q${x0 + barW},${y1} ${x0 + barW},${y1 + r} V${y0} Z" fill="${color}" ${i === highlight ? 'fill-opacity=".45" stroke="' + color + '" stroke-dasharray="3 3"' : ''}/>`;
      const step = Math.ceil(values.length / Math.max(2, Math.floor(iw / 44)));
      if (i % step === 0 || i === values.length - 1) svg += `<text class="axis" x="${cx}" y="${h - 8}" text-anchor="middle">${labels[i]}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${m.l + bw * i}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent"/>`;
    });
    svg += '</svg>';
    el.innerHTML = svg;
    el.querySelectorAll('.hit').forEach(r => {
      const i = +r.dataset.i;
      r.addEventListener('pointermove', e => showTip(e, `<div class="tip-h">${labels[i]}${i === highlight ? ' · month to date' : ''}</div>` + row(color, tipLabel, fmt(values[i])) + (extra ? extra(i) : '')));
      r.addEventListener('pointerleave', hideTip);
    });
  }

  return { SERIES, seriesColor, line, stacked, donut, ring, depth, bars, hideTip };
})();
