/* ==========================================================================
   Stealth Leviathan · utils.js
   Formatting, date math and tiny DOM helpers. No business logic here.
   ========================================================================== */
window.SL = window.SL || {};

SL.util = (function () {
  const DAY = 86400000;

  /* ---------- dates (all dates are ISO "YYYY-MM-DD", UTC-safe) ---------- */
  function parse(d) {
    if (d instanceof Date) return d;
    const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  function iso(d) { return parse(d).toISOString().slice(0, 10); }
  function addMonths(d, n) {
    const x = parse(d);
    const day = x.getUTCDate();
    const t = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last));
    return t;
  }
  function addDays(d, n) { return new Date(parse(d).getTime() + n * DAY); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function monthKey(d) { return iso(d).slice(0, 7); }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(d) { const x = parse(d); return `${String(x.getUTCDate()).padStart(2, '0')} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; }
  function fmtDateShort(d) { const x = parse(d); return `${String(x.getUTCDate()).padStart(2, '0')} ${MONTHS[x.getUTCMonth()]}`; }
  function fmtMonth(key, withYear) { const [y, m] = key.split('-'); return MONTHS[+m - 1] + (withYear ? ` ’${y.slice(2)}` : ''); }

  /* ---------- numbers ---------- */
  function usd(n, opts = {}) {
    const { dp = 0, sign = false, compact = false } = opts;
    if (n == null || isNaN(n)) return '—';
    const neg = n < 0, a = Math.abs(n);
    let s;
    if (compact && a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    else if (compact && a >= 1e4) s = (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
    else s = a.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (neg ? '−' : sign ? '+' : '') + '$' + s;
  }
  function num(n, dp = 0) {
    if (n == null || isNaN(n)) return '—';
    return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function tokens(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return num(n / 1e6, 2) + 'M';
    if (a >= 1e4) return num(n / 1e3, 1) + 'k';
    return num(n, 0);
  }
  function price(p) {
    if (p == null) return '—';
    const dp = p >= 10 ? 2 : p >= 1 ? 3 : p >= 0.1 ? 4 : 5;
    return '$' + p.toFixed(dp);
  }
  function pct(n, dp = 1, sign = false) {
    if (n == null || isNaN(n)) return '—';
    const v = n * 100;
    return (v < 0 ? '−' : sign && v > 0 ? '+' : '') + Math.abs(v).toFixed(dp) + '%';
  }
  function mult(n) { return n == null ? '—' : n.toFixed(2) + 'x'; }
  function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round(n, dp = 2) { const f = Math.pow(10, dp); return Math.round(n * f) / f; }
  function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8); }

  /* ---------- DOM ---------- */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function storage() {
    try { const k = '__sl'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
    catch (e) { return null; }
  }

  return {
    DAY, parse, iso, addMonths, addDays, daysBetween, monthKey, fmtDate, fmtDateShort, fmtMonth, MONTHS,
    usd, num, tokens, price, pct, mult, shortAddr, clamp, round, uid, esc, $, $$, storage
  };
})();
