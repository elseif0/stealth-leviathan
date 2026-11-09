/* ==========================================================================
   Stealth Leviathan · engine.js
   PURE business logic. Every function takes the state (db.json shape) and
   returns derived numbers — nothing here mutates state or touches the DOM.
   Rules implemented:
     • Vesting  : TGE % unlocked at TGE → cliff (months) → linear monthly steps
     • Rights   : OTC-bought rights inherit the remaining schedule pro-rata
     • Exit     : 20% protocol penalty → Treasury, 80% listed on the P2P book
     • Matching : market orders walk the book; slippage vs best price (mark)
     • KPIs     : invested, value, realized PnL, claimable, withdrawn, ROI, win rate
   ========================================================================== */
window.SL = window.SL || {};

SL.engine = (function () {
  const U = SL.util;
  const EPS = 1e-9;

  /* ----------------------------------------------------------------------- */
  /* Basics                                                                  */
  /* ----------------------------------------------------------------------- */
  function now(s) { return s.meta.asOf ? U.parse(s.meta.asOf) : U.parse(new Date().toISOString()); }
  function project(s, id) { return s.projects.find(p => p.id === id); }
  function penaltyRate(s) { return s.meta.penaltyRate ?? 0.2; }
  /* Primary-sale deals derive live/upcoming/closed from their window vs. the demo date. */
  function dealStatus(s, p) {
    if (!['live', 'upcoming', 'closed'].includes(p.status)) return p.status;
    const t = now(s);
    if (t < U.parse(p.opensAt)) return 'upcoming';
    if (t <= U.parse(p.closesAt)) return 'live';
    return 'closed';
  }

  /* ----------------------------------------------------------------------- */
  /* Vesting schedule                                                        */
  /* unlock k (1..L) happens at TGE + cliff + k months                        */
  /* ----------------------------------------------------------------------- */
  function schedule(p) {
    const v = p.vesting, out = [{ date: U.parse(p.tgeDate), cum: v.tgePct, k: 0 }];
    for (let k = 1; k <= v.linearMonths; k++) {
      out.push({ date: U.addMonths(p.tgeDate, v.cliffMonths + k), cum: v.tgePct + (1 - v.tgePct) * k / v.linearMonths, k });
    }
    if (!v.linearMonths) out[0].cum = 1;
    return out;
  }
  function fractionAt(p, date) {
    const t = U.parse(date);
    let f = 0;
    for (const step of schedule(p)) { if (step.date <= t) f = step.cum; else break; }
    return f;
  }
  function vestingLabel(p) {
    const v = p.vesting;
    const per = v.linearMonths ? ((1 - v.tgePct) / v.linearMonths) : 0;
    return `${U.pct(v.tgePct, 0)} at TGE · ${v.cliffMonths}m cliff · ${v.linearMonths}m linear (${U.pct(per, 1)}/mo)`;
  }
  function vestingEnd(p) { const s = schedule(p); return s[s.length - 1].date; }

  /* Tokens of a position unlocked at `date`.
     u(t) = T·(f(t)−f0)/(1−f0) − Σ exits e·max(0, f(t)−f(d))/(1−f(d))
     f0  = fraction already unlocked when the rights were acquired (OTC buys). */
  function unlockedAt(pos, p, date) {
    const f = fractionAt(p, date);
    const f0 = fractionAt(p, pos.acquiredAt);
    if (f0 >= 1 - EPS) return pos.tokens;
    let u = pos.tokens * Math.max(0, f - f0) / (1 - f0);
    for (const e of pos.events) {
      if (e.type !== 'exit' && e.type !== 'exit-cancel') continue;
      const fd = fractionAt(p, e.date);
      if (fd >= 1 - EPS) continue;
      const sign = e.type === 'exit' ? 1 : -1;
      u -= sign * e.tokens * Math.max(0, f - fd) / (1 - fd);
    }
    return Math.max(0, u);
  }

  /* ----------------------------------------------------------------------- */
  /* Order book                                                              */
  /* ----------------------------------------------------------------------- */
  function book(s, projectId) { return s.orderbooks[projectId] || (s.orderbooks[projectId] = { bids: [], asks: [] }); }
  function sortedBids(s, pid, excludeMine) {
    return book(s, pid).bids.filter(b => !(excludeMine && b.mine)).slice().sort((a, b) => b.price - a.price);
  }
  function sortedAsks(s, pid, excludeMine) {
    return book(s, pid).asks.filter(a => !(excludeMine && a.mine)).slice().sort((a, b) => a.price - b.price);
  }
  /* Mark = best bid from other members: the price a seller can actually hit. */
  function markPrice(s, pid) {
    const b = sortedBids(s, pid, true)[0];
    return b ? b.price : project(s, pid).price * 0.85;
  }
  function bookStats(s, pid) {
    const p = project(s, pid);
    const bids = sortedBids(s, pid, false), asks = sortedAsks(s, pid, false);
    const bestBid = bids[0]?.price ?? null, bestAsk = asks[0]?.price ?? null;
    const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk);
    return {
      bestBid, bestAsk, mid,
      spread: bestBid && bestAsk ? (bestAsk - bestBid) / mid : null,
      discount: mid ? 1 - mid / p.price : null,
      bidDepthUsd: bids.reduce((a, b) => a + b.tokens * b.price, 0),
      askDepthUsd: asks.reduce((a, b) => a + b.tokens * b.price, 0)
    };
  }
  /* Walk the bid side. Returns fills, VWAP and slippage vs mark (best bid). */
  function simulateMarketSell(s, pid, qty) {
    const bids = sortedBids(s, pid, true);
    const mark = bids[0]?.price ?? markPrice(s, pid);
    let left = qty, proceeds = 0; const fills = [];
    for (const b of bids) {
      if (left <= EPS) break;
      const take = Math.min(left, b.tokens);
      fills.push({ id: b.id, tokens: take, price: b.price });
      proceeds += take * b.price; left -= take;
    }
    const filled = qty - left;
    const vwap = filled > 0 ? proceeds / filled : mark;
    return { fills, filled, unfilled: Math.max(0, left), proceeds, vwap, mark, slippage: filled > 0 ? 1 - vwap / mark : 0 };
  }
  /* Walk the ask side with a USD budget. */
  function simulateMarketBuy(s, pid, usd) {
    const asks = sortedAsks(s, pid, true);
    const best = asks[0]?.price ?? null;
    let left = usd, tokens = 0; const fills = [];
    for (const a of asks) {
      if (left <= EPS) break;
      const maxTok = left / a.price, take = Math.min(maxTok, a.tokens);
      fills.push({ id: a.id, tokens: take, price: a.price });
      tokens += take; left -= take * a.price;
    }
    const spent = usd - Math.max(0, left);
    const vwap = tokens > 0 ? spent / tokens : best;
    return { fills, tokens, spent, unspent: Math.max(0, left), vwap, best, slippage: tokens > 0 && best ? vwap / best - 1 : 0 };
  }

  /* ----------------------------------------------------------------------- */
  /* Position metrics                                                        */
  /* ----------------------------------------------------------------------- */
  function positionMetrics(s, pos) {
    const p = project(s, pos.projectId), t = now(s);
    const price = p.price;
    const cpt = pos.commitment / pos.tokens; // cost per token
    let claimedTokens = 0, claimedUsd = 0, exitedTokens = 0, exitNetUsd = 0, penaltyUsd = 0;
    for (const e of pos.events) {
      if (e.type === 'claim') { claimedTokens += e.tokens; claimedUsd += e.tokens * e.price; }
      if (e.type === 'exit') { exitedTokens += e.tokens; exitNetUsd += e.netUsd || 0; penaltyUsd += e.penaltyUsd || 0; }
      if (e.type === 'exit-cancel') { exitedTokens -= e.tokens; }
    }
    const effective = pos.tokens - exitedTokens;
    const unlocked = Math.min(effective, unlockedAt(pos, p, t));
    const claimable = Math.max(0, unlocked - claimedTokens);
    const locked = Math.max(0, effective - unlocked);
    const held = claimable + locked;
    // rights currently resting in the book from this position (limit exits)
    const myAsks = book(s, p.id).asks.filter(a => a.mine && a.positionId === pos.id);
    const listedTokens = myAsks.reduce((a, x) => a + x.tokens, 0);
    const listedUsd = myAsks.reduce((a, x) => a + x.tokens * x.price, 0);
    const value = held * price + listedUsd;
    const realized = claimedUsd + exitNetUsd - cpt * (claimedTokens + exitedTokens);
    const returned = claimedUsd + exitNetUsd;
    const multiple = (value + returned) / pos.commitment;
    const unlockPct = effective > 0 ? unlocked / effective : 1;
    const claimedPct = effective > 0 ? claimedTokens / effective : 0;
    // next unlock
    let nextUnlock = null;
    for (const step of schedule(p)) {
      if (step.date > t) {
        const before = unlockedAt(pos, p, U.addDays(step.date, -1));
        const after = unlockedAt(pos, p, step.date);
        if (after - before > EPS) { nextUnlock = { date: step.date, tokens: after - before, usd: (after - before) * price }; break; }
      }
    }
    const preTge = U.parse(p.tgeDate) > t;
    const fullyVested = fractionAt(p, t) >= 1 - EPS;
    return {
      pos, project: p, price, cpt, effective, unlocked, claimable, locked, held,
      claimedTokens, claimedUsd, exitedTokens, exitNetUsd, penaltyUsd,
      listedTokens, listedUsd,
      claimableUsd: claimable * price, lockedUsd: locked * price, value,
      realized, returned, multiple, unlockPct, claimedPct, nextUnlock, preTge, fullyVested,
      costRemaining: cpt * held
    };
  }
  function allPositions(s) { return s.positions.map(pos => positionMetrics(s, pos)); }

  /* Aggregate positions per project (a project may have primary + OTC lots). */
  function byProject(s) {
    const map = new Map();
    for (const m of allPositions(s)) {
      const k = m.project.id;
      if (!map.has(k)) map.set(k, { project: m.project, lots: [], commitment: 0, value: 0, returned: 0, claimable: 0, claimableUsd: 0, locked: 0, unlocked: 0, effective: 0, claimedTokens: 0, realized: 0, listedUsd: 0, nextUnlock: null });
      const g = map.get(k);
      g.lots.push(m);
      g.commitment += m.pos.commitment; g.value += m.value; g.returned += m.returned;
      g.claimable += m.claimable; g.claimableUsd += m.claimableUsd; g.locked += m.locked;
      g.unlocked += m.unlocked; g.effective += m.effective; g.claimedTokens += m.claimedTokens;
      g.realized += m.realized; g.listedUsd += m.listedUsd;
      if (m.nextUnlock && (!g.nextUnlock || m.nextUnlock.date < g.nextUnlock.date)) g.nextUnlock = { ...m.nextUnlock };
      else if (m.nextUnlock && g.nextUnlock && +m.nextUnlock.date === +g.nextUnlock.date) { g.nextUnlock.tokens += m.nextUnlock.tokens; g.nextUnlock.usd += m.nextUnlock.usd; }
    }
    for (const g of map.values()) {
      g.multiple = (g.value + g.returned) / g.commitment;
      g.unlockPct = g.effective > 0 ? g.unlocked / g.effective : 1;
      g.claimedPct = g.effective > 0 ? g.claimedTokens / g.effective : 0;
      g.tokensHeld = g.claimable + g.locked;
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }

  /* ----------------------------------------------------------------------- */
  /* History                                                                 */
  /* ----------------------------------------------------------------------- */
  function historyMetrics(h) {
    const tokens = h.commitment / h.entryPrice;
    const proceeds = tokens * h.avgExitPrice;
    return { ...h, tokens, proceeds, pnl: proceeds - h.commitment, roi: proceeds / h.commitment - 1, multiple: proceeds / h.commitment, days: U.daysBetween(h.investedAt, h.closedAt) };
  }

  /* ----------------------------------------------------------------------- */
  /* Portfolio KPIs                                                          */
  /* ----------------------------------------------------------------------- */
  function kpis(s) {
    const pos = allPositions(s);
    const hist = s.history.map(historyMetrics);
    const groups = byProject(s);
    const activeCost = pos.reduce((a, m) => a + m.pos.commitment, 0);
    const histCost = hist.reduce((a, h) => a + h.commitment, 0);
    const totalInvested = activeCost + histCost;
    const currentValue = pos.reduce((a, m) => a + m.value, 0);
    const claimableUsd = pos.reduce((a, m) => a + m.claimableUsd, 0);
    const lockedUsd = pos.reduce((a, m) => a + m.lockedUsd, 0);
    const posRealized = pos.reduce((a, m) => a + m.realized, 0);
    const histRealized = hist.reduce((a, h) => a + h.pnl, 0);
    const realized = posRealized + histRealized;
    const realizedCost = histCost + pos.reduce((a, m) => a + m.cpt * (m.claimedTokens + m.exitedTokens), 0);
    const realizedRoi = realizedCost > 0 ? realized / realizedCost : 0;
    const withdrawnClaims = pos.reduce((a, m) => a + m.claimedUsd, 0);
    const withdrawnExits = pos.reduce((a, m) => a + m.exitNetUsd, 0);
    const withdrawnHistory = hist.reduce((a, h) => a + h.proceeds, 0);
    const withdrawnYield = s.treasury.userClaimedYield || 0;
    const totalWithdrawn = withdrawnClaims + withdrawnExits + withdrawnHistory + withdrawnYield;
    const overallRoi = totalInvested > 0 ? (currentValue + totalWithdrawn - totalInvested) / totalInvested : 0;
    const deals = groups.map(g => g.multiple).concat(hist.map(h => h.multiple));
    const wins = deals.filter(m => m > 1).length;
    const escrowPledges = s.pledges.filter(p => p.status === 'escrowed').reduce((a, p) => a + p.amount, 0);
    const escrowBids = Object.values(s.orderbooks).flatMap(b => b.bids.filter(x => x.mine)).reduce((a, b) => a + b.tokens * b.price, 0);
    const unrealized = currentValue - pos.reduce((a, m) => a + m.costRemaining, 0) - pos.reduce((a, m) => a + m.cpt * m.listedTokens, 0);
    // money in / money out timeline → latest deposit & latest withdrawal (same-day events are summed)
    const latest = list => {
      if (!list.length) return null;
      const day = list.reduce((a, e) => (e.date > a ? e.date : a), '');
      const same = list.filter(e => e.date === day);
      return { date: day, amount: same.reduce((a, e) => a + e.amount, 0), labels: same.map(e => e.label) };
    };
    const moneyIn = [
      ...s.positions.map(p => ({ date: U.iso(p.acquiredAt), amount: p.commitment, label: `${project(s, p.projectId).ticker}${p.source === 'otc' ? ' OTC' : ''}` })),
      ...s.history.map(h => ({ date: U.iso(h.investedAt), amount: h.commitment, label: h.ticker })),
      ...s.pledges.filter(p => p.status === 'escrowed').map(p => ({ date: U.iso(p.date), amount: p.amount, label: project(s, p.projectId).ticker + ' pledge' }))
    ];
    const moneyOut = [
      ...s.positions.flatMap(p => p.events.filter(e => e.type === 'claim').map(e => ({ date: U.iso(e.date), amount: e.tokens * e.price, label: project(s, p.projectId).ticker + ' claim' }))),
      ...s.positions.flatMap(p => p.events.filter(e => e.type === 'exit' && e.netUsd > 0).map(e => ({ date: U.iso(e.date), amount: e.netUsd, label: project(s, p.projectId).ticker + ' exit' }))),
      ...hist.map(h => ({ date: U.iso(h.closedAt), amount: h.proceeds, label: h.ticker + ' close' }))
    ];
    return {
      lastInvestment: latest(moneyIn), lastWithdrawal: latest(moneyOut),
      totalInvested, activeCost, histCost, currentValue, claimableUsd, lockedUsd,
      realized, realizedRoi, realizedCost, unrealized,
      totalWithdrawn, withdrawnClaims, withdrawnExits, withdrawnHistory, withdrawnYield,
      overallRoi, winRate: deals.length ? wins / deals.length : 0, wins, dealsCount: deals.length,
      escrowPledges, escrowBids, liquid: (s.user.balances.USDT || 0) + (s.user.balances.USDC || 0),
      positions: pos, groups, history: hist
    };
  }

  /* ----------------------------------------------------------------------- */
  /* Early exit quote (seller)                                               */
  /* ----------------------------------------------------------------------- */
  function exitQuote(s, positionId, usdAmount, mode, limitPrice) {
    const pos = s.positions.find(p => p.id === positionId);
    if (!pos) return null;
    const m = positionMetrics(s, pos);
    const pid = pos.projectId, rate = penaltyRate(s);
    const mark = markPrice(s, pid);
    const maxUsd = m.locked * mark;
    const gross = Math.max(0, +usdAmount || 0);
    const grossTokens = gross / mark;
    const penaltyUsd = gross * rate;
    const listedUsd = gross - penaltyUsd;
    const netTokens = grossTokens * (1 - rate);
    const q = { position: m, mark, spot: m.project.price, maxUsd, gross, grossTokens, penaltyUsd, penaltyTokens: grossTokens * rate, listedUsd, netTokens, mode, rate, errors: [] };
    if (gross <= 0) q.errors.push('Enter an amount');
    if (grossTokens > m.locked + EPS) q.errors.push(`Exceeds locked rights (max ${U.usd(maxUsd)})`);
    if (mode === 'market') {
      const sim = simulateMarketSell(s, pid, netTokens);
      q.sim = sim; q.slippage = sim.slippage;
      q.netReceive = sim.proceeds;
      q.unfilledTokens = sim.unfilled;
      if (sim.slippage > (s.meta.maxMarketSlippage || 0.05)) q.errors.push(`Slippage ${U.pct(sim.slippage)} above ${U.pct(s.meta.maxMarketSlippage || 0.05, 0)} guard — use a limit order`);
    } else {
      const lp = +limitPrice || 0;
      q.limitPrice = lp; q.slippage = 0;
      q.netReceive = netTokens * lp;
      if (lp <= 0) q.errors.push('Set a limit price');
    }
    q.effectiveVsSpot = gross > 0 ? q.netReceive / (grossTokens * m.project.price) - 1 : 0;
    q.costBasis = grossTokens * m.cpt;
    q.pnlVsCost = q.netReceive - q.costBasis;
    q.ok = q.errors.length === 0;
    return q;
  }

  /* ----------------------------------------------------------------------- */
  /* Pledge / allocation scenario (buyer, deal room)                          */
  /* ----------------------------------------------------------------------- */
  function pledgeScenario(s, projectId, amount) {
    const p = project(s, projectId), v = p.vesting;
    const tokens = amount / p.tokenPrice;
    const monthlyPct = v.linearMonths ? (1 - v.tgePct) / v.linearMonths : 0;
    const remaining = Math.max(0, p.totalPool - p.filled);
    const mine = s.pledges.filter(x => x.projectId === projectId && x.status === 'escrowed').reduce((a, x) => a + x.amount, 0);
    const errors = [];
    if (amount < p.minAlloc) errors.push(`Minimum ${U.usd(p.minAlloc)}`);
    if (amount + mine > p.maxAlloc) errors.push(`Max per member ${U.usd(p.maxAlloc)}${mine ? ` (already ${U.usd(mine)})` : ''}`);
    if (amount > remaining) errors.push(`Only ${U.usd(remaining)} left in pool`);
    return {
      project: p, amount, tokens,
      tgeTokens: tokens * v.tgePct, tgeUsd: amount * v.tgePct,
      monthlyTokens: tokens * monthlyPct, monthlyPct, monthlyUsd: amount * monthlyPct,
      firstLinear: v.linearMonths ? U.addMonths(p.tgeDate, v.cliffMonths + 1) : null,
      fullyVested: vestingEnd(p),
      share: amount / p.totalPool, remaining, mine, errors, ok: errors.length === 0,
      bear: amount * 0.5, base: amount * 2.5, bull: amount * 6   // illustrative multiples
    };
  }

  /* ----------------------------------------------------------------------- */
  /* Vesting calendar — every unlock in the next N months                     */
  /* ----------------------------------------------------------------------- */
  function vestingCalendar(s, months = 12) {
    const t = now(s), end = U.addMonths(t, months);
    const events = [];
    for (const pos of s.positions) {
      const p = project(s, pos.projectId);
      for (const step of schedule(p)) {
        if (step.date <= t || step.date > end) continue;
        const before = unlockedAt(pos, p, U.addDays(step.date, -1));
        const after = unlockedAt(pos, p, step.date);
        const tok = after - before;
        if (tok <= EPS) continue;
        const ex = events.find(e => +e.date === +step.date && e.projectId === p.id);
        if (ex) { ex.tokens += tok; ex.usd += tok * p.price; }
        else events.push({ date: step.date, projectId: p.id, project: p, tokens: tok, usd: tok * p.price, isTge: step.k === 0 });
      }
    }
    events.sort((a, b) => a.date - b.date);
    const buckets = [];
    for (let i = 0; i < months; i++) {
      const key = U.monthKey(U.addMonths(t, i));
      buckets.push({ key, total: 0, byProject: {} });
    }
    for (const e of events) {
      const b = buckets.find(x => x.key === U.monthKey(e.date));
      if (!b) continue;
      b.total += e.usd; b.byProject[e.projectId] = (b.byProject[e.projectId] || 0) + e.usd;
    }
    return { events, buckets, total: events.reduce((a, e) => a + e.usd, 0) };
  }

  /* ----------------------------------------------------------------------- */
  /* Treasury                                                                */
  /* ----------------------------------------------------------------------- */
  function treasury(s) {
    const tr = s.treasury, rate = tr.distributionRate, curKey = U.monthKey(now(s));
    const months = tr.monthlyInflows.map(m => ({ ...m, distributed: m.month < curKey ? m.penalties * rate : 0 }));
    const windowCollected = months.reduce((a, m) => a + m.penalties, 0);
    const totalCollected = tr.collectedBeforeWindow + windowCollected;
    const totalDistributed = tr.collectedBeforeWindow * rate + months.reduce((a, m) => a + m.distributed, 0);
    const current = months.find(m => m.month === curKey);
    const pendingPool = (current ? current.penalties : 0) * rate;
    const k = kpis(s);
    const userShare = tr.eligibleAum > 0 ? k.activeCost / tr.eligibleAum : 0;
    const boost = s.user.tier === 'Abyssal' ? 1.25 : 1;
    return {
      months, totalCollected, totalDistributed, balance: totalCollected - totalDistributed,
      reserve: totalCollected * (1 - rate), rate, pendingPool, userShare, boost,
      userProjected: pendingPool * userShare * boost, userAccrued: tr.userAccruedYield, userClaimed: tr.userClaimedYield,
      apr: k.activeCost > 0 ? (months.slice(-12).reduce((a, m) => a + m.penalties, 0) * rate * userShare * boost) / k.activeCost : 0,
      recent: tr.recentPenalties, membersCount: tr.membersCount,
      nextDistribution: U.iso(new Date(Date.UTC(now(s).getUTCFullYear(), now(s).getUTCMonth() + 1, 1)))  // 1st of next month
    };
  }

  return {
    now, project, penaltyRate, dealStatus, schedule, fractionAt, vestingLabel, vestingEnd, unlockedAt,
    book, sortedBids, sortedAsks, markPrice, bookStats, simulateMarketSell, simulateMarketBuy,
    positionMetrics, allPositions, byProject, historyMetrics, kpis,
    exitQuote, pledgeScenario, vestingCalendar, treasury
  };
})();
