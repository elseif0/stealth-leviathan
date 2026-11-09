/* ==========================================================================
   Stealth Leviathan · auth.js
   Members-only gate. Credentials live in db.json → auth.users[].
   Each user has `password` (plain) or `passwordSha256` (hex) — either works.
   Session: localStorage ("remember this device") or sessionStorage, expires
   after auth.sessionHours, and is voided if that user's credentials change.
   Lockout: auth.maxAttempts wrong tries → wait auth.lockoutSeconds.
   NOTE: this is a client-side demo gate. For production, verify on a server
   and never ship credentials inside a public JSON file.
   ========================================================================== */
window.SL = window.SL || {};

SL.auth = (function () {
  const KEY = 'stealth-leviathan:session';
  const LOCK = 'stealth-leviathan:lock';

  function cfg(state) { return state && state.auth && Array.isArray(state.auth.users) && state.auth.users.length ? state.auth : null; }
  function required(state) { return !!cfg(state); }
  function sig(u) {               // fingerprint of the credential, so editing db.json logs everyone out
    const s = (u.email || '').toLowerCase() + '|' + (u.password || u.passwordSha256 || '');
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function stores() {             // { local, session } — either may be null in sandboxed viewers
    const pick = name => { try { const st = window[name]; st.getItem('x'); return st; } catch (e) { return null; } };
    return { local: pick('localStorage'), session: pick('sessionStorage') };
  }
  const all = () => { const s = stores(); return [s.local, s.session].filter(Boolean); };
  let memSession = null;          // fallback when storage is unavailable

  function current(state) {
    const c = cfg(state); if (!c) return null;
    let sess = memSession;
    for (const st of all()) { try { const v = JSON.parse(st.getItem(KEY) || 'null'); if (v) { sess = v; break; } } catch (e) { /* ignore */ } }
    if (!sess || Date.now() > sess.exp) return null;
    const u = c.users.find(x => x.email.toLowerCase() === sess.email);
    return u && sig(u) === sess.sig ? { ...u, password: undefined, passwordSha256: undefined } : null;
  }

  async function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function lockState() {
    try { return JSON.parse(sessionStorage.getItem(LOCK) || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; }
  }
  function setLock(v) { try { sessionStorage.setItem(LOCK, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function lockedFor() { const l = lockState(); return Math.max(0, Math.ceil((l.until - Date.now()) / 1000)); }

  async function login(state, email, password, remember) {
    const c = cfg(state);
    const wait = lockedFor();
    if (wait) return { ok: false, msg: `Too many attempts. Try again in ${wait}s.`, locked: wait };
    const e = String(email || '').trim().toLowerCase();
    const u = c.users.find(x => x.email.toLowerCase() === e);
    let good = false;
    if (u && u.passwordSha256) good = (await sha256(password)) === u.passwordSha256.toLowerCase();
    else if (u) good = password === u.password;
    if (!good) {
      const l = lockState(); l.n += 1;
      const max = c.maxAttempts || 5;
      if (l.n >= max) { l.n = 0; l.until = Date.now() + (c.lockoutSeconds || 60) * 1000; setLock(l); return { ok: false, msg: `Too many attempts. Locked for ${c.lockoutSeconds || 60}s.`, locked: c.lockoutSeconds || 60 }; }
      setLock(l);
      return { ok: false, msg: `Invalid email or password · ${max - l.n} attempt${max - l.n === 1 ? '' : 's'} left` };
    }
    setLock({ n: 0, until: 0 });
    const sess = { email: e, sig: sig(u), exp: Date.now() + (c.sessionHours || 12) * 3600e3, at: Date.now() };
    memSession = sess;
    const { local, session } = stores();
    const target = remember ? (local || session) : (session || local);
    try { if (target) target.setItem(KEY, JSON.stringify(sess)); } catch (err) { /* memory only */ }
    return { ok: true, user: u };
  }

  function logout() {
    memSession = null;
    for (const st of all()) { try { st.removeItem(KEY); } catch (e) { /* ignore */ } }
  }

  return { required, current, login, logout, lockedFor };
})();
