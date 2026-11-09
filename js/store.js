/* ==========================================================================
   Stealth Leviathan · store.js
   Single source of truth. Loads data/db.json, applies actions (reducers),
   persists the session to localStorage and notifies subscribed views.
   The session is bound to a fingerprint of db.json: edit the JSON and reload
   → the stale browser session is discarded automatically.
   ========================================================================== */
window.SL = window.SL || {};

SL.store = (function () {
  const U = SL.util, E = SL.engine;
  const KEY = 'stealth-leviathan:v1';
  let state = null, seed = null, fingerprint = '', listeners = [];

  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  const clone = o => JSON.parse(JSON.stringify(o));

  async function load(url = 'data/db.json') {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('db.json HTTP ' + res.status);
    const text = await res.text();
    return boot(text);
  }
  function boot(text) {
    seed = JSON.parse(text);
    fingerprint = hash(text);
    const ls = U.storage();
    let saved = null;
    try { saved = ls && JSON.parse(ls.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    state = saved && saved.fingerprint === fingerprint ? saved.state : clone(seed);
    return state;
  }
  function persist() {
    const ls = U.storage(); if (!ls) return;
    try { ls.setItem(KEY, JSON.stringify({ fingerprint, state })); } catch (e) { /* quota / sandbox */ }
  }
  function subscribe(fn) { listeners.push(fn); return () => (listeners = listeners.filter(l => l !== fn)); }
  function emit(action) { persist(); listeners.forEach(fn => fn(state, action)); }
  function get() { return state; }
  function reset() { state = clone(seed); emit({ type: 'RESET' }); }
  function importJSON(obj) { seed = obj; fingerprint = hash(JSON.stringify(obj)); state = clone(obj); emit({ type: 'IMPORT' }); }
  function exportJSON() { return JSON.stringify(state, null, 2); }

  /* ------------------------------ helpers ------------------------------ */
  const today = () => U.iso(E.now(state));
  function log(type, label, amount, currency = 'USDT') { state.ledger.unshift({ date: today(), type, label, amount: U.round(amount, 2), currency }); }
  function addPenaltyToTreasury(ticker, grossUsd, penaltyUsd) {
    const key = U.monthKey(E.now(state));
    let m = state.treasury.monthlyInflows.find(x => x.month === key);
    if (!m) { m = { month: key, penalties: 0 }; state.treasury.monthlyInflows.push(m); }
    m.penalties = U.round(m.penalties + penaltyUsd, 2);
    state.treasury.recentPenalties.unshift({ date: today(), ticker, grossUsd: U.round(grossUsd, 2), penaltyUsd: U.round(penaltyUsd, 2), mine: true });
  }
  function consume(side, fills) {
    for (const f of fills) {
      const o = side.find(x => x.id === f.id); if (!o) continue;
      o.tokens -= f.tokens;
      if (o.grossTokens) o.grossTokens = o.tokens / (1 - E.penaltyRate(state));
    }
    for (let i = side.length - 1; i >= 0; i--) if (side[i].tokens <= 1e-6) side.splice(i, 1);
  }
  const ok = msg => ({ ok: true, msg });
  const fail = msg => ({ ok: false, msg });

  /* ------------------------------ reducers ----------------------------- */
  const actions = {
    CLAIM({ positionId }) {
      const pos = state.positions.find(p => p.id === positionId);
      const m = E.positionMetrics(state, pos);
      if (m.claimable < 1) return fail('Nothing claimable yet');
      pos.events.push({ type: 'claim', date: today(), tokens: U.round(m.claimable, 4), price: m.price });
      log('claim', `Claimed ${U.num(m.claimable)} ${m.project.ticker}`, m.claimableUsd, 'USDT-eq');
      return ok(`${U.num(m.claimable)} ${m.project.ticker} (${U.usd(m.claimableUsd)}) sent to your Safe`);
    },
    CLAIM_ALL() {
      let n = 0, usd = 0;
      for (const pos of state.positions) {
        const m = E.positionMetrics(state, pos);
        if (m.claimable >= 1) { actions.CLAIM({ positionId: pos.id }); n++; usd += m.claimableUsd; }
      }
      return n ? ok(`Claimed ${n} tranches · ${U.usd(usd)} to wallet`) : fail('Nothing claimable');
    },

    PLEDGE({ projectId, amount, currency = 'USDT' }) {
      const sc = E.pledgeScenario(state, projectId, amount);
      if (!sc.ok) return fail(sc.errors[0]);
      if ((state.user.balances[currency] || 0) < amount) return fail(`Insufficient ${currency} balance`);
      const p = E.project(state, projectId);
      if (E.dealStatus(state, p) !== 'live') return fail('Deal is not open for allocations');
      state.user.balances[currency] -= amount;
      p.filled += amount;
      state.pledges.unshift({ id: U.uid('pl'), projectId, amount, currency, date: today(), status: 'escrowed', txHash: '0x' + Math.random().toString(16).slice(2, 6) + '…' + Math.random().toString(16).slice(2, 6) });
      log('pledge', `Allocation escrowed · ${p.ticker}`, -amount, currency);
      return ok(`${U.usd(amount)} ${currency} locked in the ${p.ticker} allocation contract`);
    },
    CANCEL_PLEDGE({ id }) {
      const pl = state.pledges.find(x => x.id === id);
      const p = E.project(state, pl.projectId);
      if (E.dealStatus(state, p) !== 'live') return fail('Allocation window closed — pledge is final');
      pl.status = 'cancelled'; p.filled -= pl.amount;
      state.user.balances[pl.currency] += pl.amount;
      log('refund', `Allocation withdrawn · ${p.ticker}`, pl.amount, pl.currency);
      return ok(`${U.usd(pl.amount)} returned from escrow`);
    },

    EARLY_EXIT({ positionId, usd, mode, limitPrice }) {
      const q = E.exitQuote(state, positionId, usd, mode, limitPrice);
      if (!q || !q.ok) return fail(q ? q.errors[0] : 'Unknown position');
      const pos = state.positions.find(p => p.id === positionId);
      const p = q.position.project, bk = E.book(state, p.id);
      const ev = { type: 'exit', date: today(), tokens: U.round(q.grossTokens, 4), mark: q.mark, grossUsd: U.round(q.gross, 2), penaltyUsd: U.round(q.penaltyUsd, 2), listedUsd: U.round(q.listedUsd, 2), netUsd: 0, mode };
      addPenaltyToTreasury(p.ticker, q.gross, q.penaltyUsd);
      if (mode === 'market') {
        consume(bk.bids, q.sim.fills);
        ev.netUsd = U.round(q.sim.proceeds, 2);
        state.user.balances.USDT += q.sim.proceeds;
        if (q.sim.unfilled > 1e-6) {
          const id = U.uid('a'); ev.orderId = id;
          bk.asks.push({ id, maker: state.user.memberId, grossTokens: q.sim.unfilled / (1 - q.rate), tokens: q.sim.unfilled, price: q.mark, date: today(), mine: true, positionId });
        }
        pos.events.push(ev);
        log('exit', `Early exit · ${p.ticker} (−${U.usd(q.penaltyUsd)} penalty)`, q.sim.proceeds);
        return ok(`Sold ${U.tokens(q.sim.filled)} ${p.ticker} rights · received ${U.usd(q.sim.proceeds)}`);
      }
      const id = U.uid('a'); ev.orderId = id;
      bk.asks.push({ id, maker: state.user.memberId, grossTokens: q.grossTokens, tokens: q.netTokens, price: q.limitPrice, date: today(), mine: true, positionId });
      pos.events.push(ev);
      log('exit', `Limit exit listed · ${p.ticker} @ ${U.price(q.limitPrice)} (−${U.usd(q.penaltyUsd)} penalty)`, 0);
      return ok(`${U.tokens(q.netTokens)} ${p.ticker} rights listed @ ${U.price(q.limitPrice)}`);
    },
    CANCEL_ASK({ projectId, id }) {
      const bk = E.book(state, projectId), a = bk.asks.find(x => x.id === id && x.mine);
      if (!a) return fail('Order not found');
      const pos = state.positions.find(p => p.id === a.positionId);
      pos.events.push({ type: 'exit-cancel', date: today(), tokens: a.tokens, orderId: id });
      bk.asks.splice(bk.asks.indexOf(a), 1);
      log('cancel', `Ask cancelled · ${E.project(state, projectId).ticker} — rights returned, penalty retained`, 0);
      return ok('Rights returned to your vesting ledger. The 20% penalty is non-refundable.');
    },

    BUY_MARKET({ projectId, usd }) {
      const amt = +usd || 0;
      if (amt <= 0) return fail('Enter an amount');
      if (state.user.balances.USDT < amt) return fail('Insufficient USDT');
      const sim = E.simulateMarketBuy(state, projectId, amt);
      if (sim.tokens <= 0) return fail('No asks available');
      const bk = E.book(state, projectId), p = E.project(state, projectId);
      consume(bk.asks, sim.fills);
      state.user.balances.USDT -= sim.spent;
      state.positions.push({ id: U.uid('pos-' + projectId), projectId, source: 'otc', acquiredAt: today(), commitment: U.round(sim.spent, 2), tokens: U.round(sim.tokens, 4), events: [] });
      log('otc-buy', `OTC buy · ${U.num(sim.tokens)} ${p.ticker} rights`, -sim.spent);
      return ok(`Bought ${U.tokens(sim.tokens)} ${p.ticker} rights @ ${U.price(sim.vwap)} avg`);
    },
    PLACE_BID({ projectId, tokens, price }) {
      const t = +tokens, pr = +price, cost = t * pr;
      if (!(t > 0 && pr > 0)) return fail('Enter size and price');
      if (state.user.balances.USDT < cost) return fail('Insufficient USDT for escrow');
      const p = E.project(state, projectId);
      const bestAsk = E.sortedAsks(state, projectId, true)[0];
      if (bestAsk && pr >= bestAsk.price) return fail(`Price crosses best ask ${U.price(bestAsk.price)} — use Market Buy`);
      state.user.balances.USDT -= cost;
      E.book(state, projectId).bids.push({ id: U.uid('b'), maker: state.user.memberId, tokens: t, price: pr, date: today(), mine: true });
      log('bid', `Bid placed · ${p.ticker} ${U.num(t)} @ ${U.price(pr)}`, -cost);
      return ok(`Bid live · ${U.usd(cost)} escrowed`);
    },
    CANCEL_BID({ projectId, id }) {
      const bk = E.book(state, projectId), b = bk.bids.find(x => x.id === id && x.mine);
      if (!b) return fail('Order not found');
      state.user.balances.USDT += b.tokens * b.price;
      bk.bids.splice(bk.bids.indexOf(b), 1);
      log('refund', `Bid cancelled · ${E.project(state, projectId).ticker}`, b.tokens * b.price);
      return ok('Bid cancelled, escrow released');
    },
    /* Demo helper: a counter-party whale fills one of your resting orders */
    SIMULATE_FILL({ projectId, id, side }) {
      const bk = E.book(state, projectId), p = E.project(state, projectId);
      if (side === 'ask') {
        const a = bk.asks.find(x => x.id === id && x.mine); if (!a) return fail('Order not found');
        const usd = a.tokens * a.price;
        const pos = state.positions.find(x => x.id === a.positionId);
        const ev = pos.events.find(e => e.orderId === id) || pos.events.filter(e => e.type === 'exit').pop();
        ev.netUsd = U.round((ev.netUsd || 0) + usd, 2);
        state.user.balances.USDT += usd;
        bk.asks.splice(bk.asks.indexOf(a), 1);
        log('exit', `Ask filled · ${U.num(a.tokens)} ${p.ticker} @ ${U.price(a.price)}`, usd);
        return ok(`Ask filled · ${U.usd(usd)} received`);
      }
      const b = bk.bids.find(x => x.id === id && x.mine); if (!b) return fail('Order not found');
      state.positions.push({ id: U.uid('pos-' + projectId), projectId, source: 'otc', acquiredAt: today(), commitment: U.round(b.tokens * b.price, 2), tokens: b.tokens, events: [] });
      bk.bids.splice(bk.bids.indexOf(b), 1);
      log('otc-buy', `Bid filled · ${U.num(b.tokens)} ${p.ticker} rights`, 0);
      return ok(`Bid filled · ${U.tokens(b.tokens)} ${p.ticker} rights added to portfolio`);
    },

    CLAIM_YIELD() {
      const y = state.treasury.userAccruedYield;
      if (y <= 0) return fail('No yield accrued');
      state.treasury.userAccruedYield = 0;
      state.treasury.userClaimedYield += y;
      state.user.balances.USDT += y;
      log('yield', 'Treasury yield distribution', y);
      return ok(`${U.usd(y)} treasury yield claimed`);
    },
    SET_ASOF({ date }) { state.meta.asOf = date; return ok(`Demo date set to ${U.fmtDate(date)}`); }
  };

  function dispatch(type, payload = {}) {
    if (!actions[type]) return fail('Unknown action ' + type);
    const before = JSON.stringify(state);
    let res;
    try { res = actions[type](payload); }
    catch (e) { console.error(e); state = JSON.parse(before); res = fail(e.message); }
    if (!res.ok) state = JSON.parse(before); // atomic: failed actions leave no trace
    else emit({ type, payload });
    return res;
  }

  return { load, boot, get, subscribe, dispatch, reset, exportJSON, importJSON };
})();
