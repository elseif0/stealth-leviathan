/* OTC · Stealth P2P order book for locked vesting rights: depth, asks (gross − 20% = net), bids,
   Early-Exit simulator (market / limit), buy-side, my open orders, irreversible-exit confirmation. */
window.SL = window.SL || {}; SL.views = SL.views || {};

SL.views.otc = {
  title: 'OTC Desk',
  ui: { market: null, side: 'sell', positionId: null, usd: 20000, mode: 'market', limit: null, buyMode: 'market', buyUsd: 25000, bidTokens: 0, bidPrice: 0 },

  render(root, s) {
    const U = SL.util, E = SL.engine, UI = SL.ui, C = SL.charts, ui = this.ui;
    const markets = Object.keys(s.orderbooks).filter(id => E.project(s, id));
    if (!ui.market || !markets.includes(ui.market)) ui.market = markets[0];
    const pid = ui.market, p = E.project(s, pid), st = E.bookStats(s, pid);
    const bids = E.sortedBids(s, pid, false), asks = E.sortedAsks(s, pid, false);
    const maxRow = Math.max(...bids.map(b => b.tokens * b.price), ...asks.map(a => a.tokens * a.price), 1);
    const myOrders = markets.flatMap(id => {
      const b = E.book(s, id), pr = E.project(s, id);
      return [...b.bids.filter(x => x.mine).map(x => ({ ...x, side: 'bid', p: pr })), ...b.asks.filter(x => x.mine).map(x => ({ ...x, side: 'ask', p: pr }))];
    });
    const rate = E.penaltyRate(s);

    root.innerHTML = `
      <section class="page-h">
        <div><p class="eyebrow">Members-only · Locked rights · Settled in USDT</p><h1 class="display">Stealth <em>OTC Desk</em></h1></div>
        <div class="penalty-pill">${UI.icons.warn}<span>Early exit = <b>${U.pct(rate, 0)} protocol penalty</b> → Treasury · ${U.pct(1 - rate, 0)} listed</span></div>
      </section>

      <nav class="mkt-tabs" aria-label="Markets">${markets.map(id => {
        const pr = E.project(s, id), x = E.bookStats(s, id);
        return `<button class="mkt ${id === pid ? 'on' : ''}" data-mkt="${id}">${UI.logo(pr, 26)}<span><b>${pr.ticker}</b><small class="num">${U.price(pr.price)} · bid ${x.bestBid ? U.pct(x.bestBid / pr.price - 1, 0) : '—'}</small></span></button>`;
      }).join('')}</nav>

      <section class="otc-grid">
        <div class="otc-main">
          <article class="card">
            <div class="mkt-stats">
              <div><span>${p.priceSource === 'otc-indicative' ? 'Indicative' : 'Spot'} price</span><b class="num">${U.price(p.price)}</b></div>
              <div><span>Mark (best bid)</span><b class="num bid-t">${st.bestBid ? U.price(st.bestBid) : '—'}</b></div>
              <div><span>Best ask</span><b class="num ask-t">${st.bestAsk ? U.price(st.bestAsk) : '—'}</b></div>
              <div><span>Spread</span><b class="num">${st.spread != null ? U.pct(st.spread, 2) : '—'}</b></div>
              <div><span>Mid discount</span><b class="num">${st.discount != null ? U.pct(-st.discount, 1, true) : '—'}</b></div>
              <div><span>Depth bid / ask</span><b class="num">${U.usd(st.bidDepthUsd, { compact: true })} / ${U.usd(st.askDepthUsd, { compact: true })}</b></div>
            </div>
            <div id="depth" class="chart"></div>
            <div class="legend center"><span><i style="background:var(--bid)"></i>Bids (cumulative)</span><span><i style="background:var(--ask)"></i>Asks (cumulative)</span><span><i class="dash" style="border-color:var(--gold)"></i>${p.priceSource === 'otc-indicative' ? 'Indicative' : 'Spot'}</span></div>
          </article>

          <div class="book-2">
            <article class="card book">
              <header class="card-h"><div><h2 class="ask-t">Sell Orders · Asks</h2><p class="muted small">Exit amount − ${U.pct(rate, 0)} penalty = net on board</p></div></header>
              <div class="table-wrap"><table class="tbl book-t">
                <thead><tr><th>Price</th><th class="r">Exit (gross)</th><th class="r">−${U.pct(rate, 0)}</th><th class="r">Net on board</th><th class="r hide-sm">vs spot</th></tr></thead>
                <tbody>${asks.map(a => { const v = a.tokens * a.price, g = (a.grossTokens || a.tokens / (1 - rate)) * a.price; return `
                  <tr class="${a.mine ? 'mine' : ''}" style="--w:${v / maxRow * 100}%">
                    <td class="num ask-t depth-ask">${U.price(a.price)}${a.mine ? ' <span class="you">YOU</span>' : ''}</td>
                    <td class="r num muted">${U.usd(g)}</td><td class="r num neg">−${U.usd(g - v)}</td>
                    <td class="r num"><b>${U.usd(v)}</b><br><span class="muted small">${U.tokens(a.tokens)} ${p.ticker}</span></td>
                    <td class="r num muted hide-sm">${U.pct(a.price / p.price - 1, 1)}</td></tr>`; }).join('') || `<tr><td colspan="5">${UI.empty('No asks')}</td></tr>`}</tbody>
              </table></div>
            </article>
            <article class="card book">
              <header class="card-h"><div><h2 class="bid-t">Buy Orders · Bids</h2><p class="muted small">Whales collecting discounted rights</p></div></header>
              <div class="table-wrap"><table class="tbl book-t">
                <thead><tr><th>Price</th><th class="r">Size</th><th class="r">Value</th><th class="r hide-sm">vs spot</th><th class="r hide-sm">Maker</th></tr></thead>
                <tbody>${bids.map(b => { const v = b.tokens * b.price; return `
                  <tr class="${b.mine ? 'mine' : ''}" style="--w:${v / maxRow * 100}%">
                    <td class="num bid-t depth-bid">${U.price(b.price)}${b.mine ? ' <span class="you">YOU</span>' : ''}</td>
                    <td class="r num">${U.tokens(b.tokens)}</td><td class="r num"><b>${U.usd(v)}</b></td>
                    <td class="r num muted hide-sm">${U.pct(b.price / p.price - 1, 1)}</td><td class="r mono small muted hide-sm">${b.mine ? 'You' : b.maker}</td></tr>`; }).join('') || `<tr><td colspan="5">${UI.empty('No bids')}</td></tr>`}</tbody>
              </table></div>
            </article>
          </div>
        </div>

        <aside class="otc-side">
          <article class="card trade">
            <div class="seg full"><button class="${ui.side === 'sell' ? 'on sell' : ''}" data-side="sell">Early Exit · Sell</button><button class="${ui.side === 'buy' ? 'on buy' : ''}" data-side="buy">Buy Rights</button></div>
            <div id="trade-body"></div>
          </article>
        </aside>
      </section>

      <section class="card">
        <header class="card-h"><div><h2>My Open Orders</h2><p class="muted">Bids are USDT-escrowed · asks hold your rights in escrow</p></div></header>
        ${myOrders.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Market</th><th>Side</th><th class="r">Price</th><th class="r">Size</th><th class="r">Value</th><th>Placed</th><th></th></tr></thead><tbody>
          ${myOrders.map(o => `<tr><td><div class="row">${UI.logo(o.p, 26)}<b>${o.p.ticker}</b></div></td>
            <td><span class="badge ${o.side === 'bid' ? 'vest' : 'ask'}">${o.side === 'bid' ? 'Bid' : 'Ask'}</span></td>
            <td class="r num">${U.price(o.price)}</td><td class="r num">${U.tokens(o.tokens)}</td><td class="r num">${U.usd(o.tokens * o.price)}</td><td>${U.fmtDate(o.date)}</td>
            <td class="r nowrap"><button class="btn sm ghost" data-sim="${o.id}" data-sp="${o.p.id}" data-sd="${o.side}" title="Demo: a counter-party whale fills this order">⚡ Sim fill</button> <button class="btn sm danger-ghost" data-cx="${o.id}" data-sp="${o.p.id}" data-sd="${o.side}">Cancel</button></td></tr>`).join('')}
        </tbody></table></div>` : UI.empty('No open orders')}
      </section>`;

    C.depth(U.$('#depth', root), { bids, asks, spot: p.price, height: 210 });
    root.querySelectorAll('[data-mkt]').forEach(b => b.addEventListener('click', () => { ui.market = b.dataset.mkt; ui.positionId = null; ui.limit = null; ui.bidPrice = 0; SL.app.render(); }));
    root.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { ui.side = b.dataset.side; SL.app.render(); }));
    root.querySelectorAll('[data-cx]').forEach(b => b.addEventListener('click', () => {
      const { cx, sp, sd } = b.dataset;
      if (sd === 'ask') {
        UI.modal({ title: 'Cancel ask?', width: 440, body: `<p class="muted">Your unsold rights return to the vesting ledger. <b class="neg">The ${U.pct(rate, 0)} penalty already paid to the Treasury is not refunded.</b></p><div class="row end gap"><button class="btn ghost" data-close>Keep order</button><button class="btn danger" id="cx-go">Cancel ask</button></div>`,
          onMount(m, close) { m.querySelector('#cx-go').addEventListener('click', () => { close(); SL.app.act('CANCEL_ASK', { projectId: sp, id: cx }); }); } });
      } else SL.app.act('CANCEL_BID', { projectId: sp, id: cx });
    }));
    root.querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => SL.app.act('SIMULATE_FILL', { projectId: b.dataset.sp, id: b.dataset.sim, side: b.dataset.sd })));
    ui.side === 'sell' ? this.sellPanel(U.$('#trade-body', root), s, p) : this.buyPanel(U.$('#trade-body', root), s, p);
  },

  /* ----------------------------- Exit simulator ----------------------------- */
  sellPanel(el, s, p) {
    const U = SL.util, E = SL.engine, UI = SL.ui, ui = this.ui, rate = E.penaltyRate(s);
    const lots = E.allPositions(s).filter(m => m.project.id === p.id && m.locked >= 1);
    if (!lots.length) { el.innerHTML = UI.empty(`You hold no locked ${p.ticker} rights.<br><button class="btn sm ghost" data-goside="buy">Buy ${p.ticker} rights instead →</button>`); el.querySelector('[data-goside]').addEventListener('click', () => { ui.side = 'buy'; SL.app.render(); }); return; }
    if (!lots.find(l => l.pos.id === ui.positionId)) ui.positionId = lots[0].pos.id;
    const mark = E.markPrice(s, p.id);
    const bestAsk = E.sortedAsks(s, p.id, true)[0];
    if (!ui.limit) ui.limit = U.round(bestAsk ? bestAsk.price * 0.998 : mark * 1.03, 5);

    el.innerHTML = `
      <label class="fld-l">Position lot</label>
      <select id="ex-lot" class="fld">${lots.map(l => `<option value="${l.pos.id}" ${l.pos.id === ui.positionId ? 'selected' : ''}>${l.pos.source === 'otc' ? 'OTC lot' : 'Primary lot'} · ${U.tokens(l.locked)} locked · max ${U.usd(l.locked * mark, { compact: true })}</option>`).join('')}</select>
      <label class="fld-l">Amount to exit <span class="muted">(valued at mark ${U.price(mark)})</span></label>
      <div class="amount-in"><span>$</span><input id="ex-usd" type="text" inputmode="numeric" value="${U.num(ui.usd)}" autocomplete="off"><em>USDT</em></div>
      <div class="quick">${[0.25, 0.5, 0.75, 1].map(f => `<button class="chip-btn" data-f="${f}">${f === 1 ? 'Max' : f * 100 + '%'}</button>`).join('')}</div>
      <div class="seg full sm mt"><button class="${ui.mode === 'market' ? 'on' : ''}" data-mode="market">Market Sell</button><button class="${ui.mode === 'limit' ? 'on' : ''}" data-mode="limit">Limit Sell</button></div>
      ${ui.mode === 'limit' ? `<label class="fld-l">Limit price <span class="muted">(spot ${U.price(p.price)})</span></label><div class="amount-in"><span>$</span><input id="ex-lp" type="text" inputmode="decimal" value="${ui.limit}"><em>/${p.ticker}</em></div>` : ''}
      <div class="calc exit" id="ex-out"></div>
      <button class="btn danger block lg" id="ex-go">Confirm Early Exit & List Order</button>
      <p class="muted small center mt">Penalty is applied on listing and is non-refundable.</p>`;

    const lotSel = el.querySelector('#ex-lot'), usdIn = el.querySelector('#ex-usd'), out = el.querySelector('#ex-out'), go = el.querySelector('#ex-go');
    const lpIn = el.querySelector('#ex-lp');
    const read = v => +String(v).replace(/[^\d.]/g, '') || 0;
    const quote = () => E.exitQuote(s, ui.positionId, ui.usd, ui.mode, ui.limit);
    const draw = () => {
      const q = quote();
      out.innerHTML = `
        <div class="calc-row"><span>Exit amount (gross)</span><b class="num">${U.usd(q.gross)}</b></div>
        <div class="calc-row neg-row"><span>Protocol penalty (${U.pct(rate, 0)}) <em>→ Treasury</em></span><b class="num neg">−${U.usd(q.penaltyUsd)} USDT</b></div>
        <div class="calc-row"><span>Net listed on board</span><b class="num">${U.usd(q.listedUsd)} USDT</b></div>
        ${ui.mode === 'market'
          ? `<div class="calc-row"><span>Estimated slippage</span><b class="num ${q.slippage > 0.03 ? 'neg' : ''}">${U.pct(q.slippage, 2)}</b></div>
             <div class="calc-row total"><span>Net received · instant sell</span><b class="num">${U.usd(q.netReceive)} USDT</b></div>
             ${q.unfilledTokens > 1 ? `<div class="warn-s">Book depth insufficient: ${U.tokens(q.unfilledTokens)} ${p.ticker} will rest as an ask at mark.</div>` : ''}`
          : `<div class="calc-row"><span>Slippage</span><b class="num">0.00% <em>(resting order)</em></b></div>
             <div class="calc-row total"><span>Net received · if filled</span><b class="num">${U.usd(q.netReceive)} USDT</b></div>`}
        <details class="calc-more"><summary>Execution details</summary>
          <div class="calc-row"><span>Rights removed from ledger</span><b class="num">${U.num(q.grossTokens)} ${p.ticker}</b></div>
          <div class="calc-row"><span>…of which penalty / listed</span><b class="num">${U.tokens(q.penaltyTokens)} / ${U.tokens(q.netTokens)}</b></div>
          ${ui.mode === 'market' && q.sim ? `<div class="calc-row"><span>VWAP · ${q.sim.fills.length} bid levels hit</span><b class="num">${U.price(q.sim.vwap)}</b></div>` : ''}
          <div class="calc-row"><span>Effective price vs spot</span><b class="num neg">${U.pct(q.effectiveVsSpot, 1)}</b></div>
          <div class="calc-row"><span>PnL vs cost basis (${U.price(q.position.cpt)})</span><b class="num ${q.pnlVsCost >= 0 ? 'pos' : 'neg'}">${U.usd(q.pnlVsCost, { sign: true })}</b></div>
        </details>
        ${q.errors.length ? `<div class="err">${U.esc(q.errors[0])}</div>` : ''}`;
      go.disabled = !q.ok;
    };
    lotSel.addEventListener('change', () => { ui.positionId = lotSel.value; draw(); });
    usdIn.addEventListener('input', () => { ui.usd = read(usdIn.value); draw(); });
    usdIn.addEventListener('blur', () => { usdIn.value = U.num(ui.usd); });
    lpIn && lpIn.addEventListener('input', () => { ui.limit = read(lpIn.value); draw(); });
    el.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
      const m = E.positionMetrics(s, s.positions.find(x => x.id === ui.positionId));
      ui.usd = Math.floor(m.locked * mark * +b.dataset.f); usdIn.value = U.num(ui.usd); draw();
    }));
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { ui.mode = b.dataset.mode; SL.app.render(); }));
    go.addEventListener('click', () => this.confirmExit(quote()));
    draw();
  },

  /* ------------------- Irreversible early-exit confirmation ------------------- */
  confirmExit(q) {
    const U = SL.util, UI = SL.ui, p = q.position.project;
    UI.modal({
      title: `${UI.icons.warn} Confirm irreversible early exit`, tone: 'danger', width: 500,
      body: `
        <div class="confirm">
          <div class="confirm-hero">
            <span class="muted">You are exiting</span>
            <b class="num">${U.usd(q.gross)}</b>
            <span class="muted">of locked ${p.ticker} vesting rights · ${U.num(q.grossTokens)} tokens</span>
          </div>
          <div class="calc exit">
            <div class="calc-row neg-row"><span>Protocol penalty (${U.pct(q.rate, 0)}) → Treasury</span><b class="num neg">−${U.usd(q.penaltyUsd)}</b></div>
            <div class="calc-row"><span>Listed on OTC board</span><b class="num">${U.usd(q.listedUsd)}</b></div>
            <div class="calc-row"><span>${q.mode === 'market' ? `Market sell · slippage ${U.pct(q.slippage, 2)}` : `Limit sell @ ${U.price(q.limitPrice)}`}</span><b class="num">${U.usd(q.netReceive)}</b></div>
            <div class="calc-row total"><span>${q.mode === 'market' ? 'You receive now' : 'You receive if filled'}</span><b class="num">${U.usd(q.netReceive)} USDT</b></div>
          </div>
          <ul class="risk-list">
            <li>The ${U.pct(q.rate, 0)} penalty is <b>deducted immediately and is never refunded</b>, even if you cancel a resting order.</li>
            <li>Sold rights leave your vesting ledger permanently; future unlocks are reduced pro-rata.</li>
            <li>Settlement is executed by the escrow contract and <b>cannot be reversed</b>.</li>
          </ul>
          <label class="check"><input type="checkbox" id="cf-ack"><span>I understand the ${U.pct(q.rate, 0)} penalty and that this action is irreversible.</span></label>
          <label class="fld-l">Type <b class="mono">${p.ticker}</b> to confirm</label>
          <input id="cf-type" class="fld mono" autocomplete="off" placeholder="${p.ticker}">
          <div class="row end gap mt"><button class="btn ghost" data-close>Go back</button><button class="btn danger" id="cf-go" disabled>Execute exit · −${U.usd(q.penaltyUsd, { compact: true })} penalty</button></div>
        </div>`,
      onMount(m, close) {
        const ack = m.querySelector('#cf-ack'), typ = m.querySelector('#cf-type'), go = m.querySelector('#cf-go');
        const check = () => (go.disabled = !(ack.checked && typ.value.trim().toUpperCase() === p.ticker));
        ack.addEventListener('change', check); typ.addEventListener('input', check);
        go.addEventListener('click', () => {
          const r = SL.app.act('EARLY_EXIT', { positionId: q.position.pos.id, usd: q.gross, mode: q.mode, limitPrice: q.limitPrice });
          if (r.ok) close();
        });
      }
    });
  },

  /* ------------------------------- Buy rights ------------------------------- */
  buyPanel(el, s, p) {
    const U = SL.util, E = SL.engine, UI = SL.ui, ui = this.ui;
    const bestBid = E.sortedBids(s, p.id, true)[0];
    if (!ui.bidPrice) ui.bidPrice = U.round((bestBid ? bestBid.price : p.price * 0.85) * 1.002, 5);
    if (!ui.bidTokens) ui.bidTokens = Math.round(10000 / ui.bidPrice / 1000) * 1000;
    const nextStep = E.schedule(p).find(x => x.date > E.now(s));
    el.innerHTML = `
      <div class="seg full sm"><button class="${ui.buyMode === 'market' ? 'on' : ''}" data-bm="market">Market Buy</button><button class="${ui.buyMode === 'limit' ? 'on' : ''}" data-bm="limit">Limit Bid</button></div>
      ${ui.buyMode === 'market'
        ? `<label class="fld-l">Spend <span class="muted">(USDT balance ${U.usd(s.user.balances.USDT)})</span></label>
           <div class="amount-in"><span>$</span><input id="b-usd" type="text" inputmode="numeric" value="${U.num(ui.buyUsd)}"><em>USDT</em></div>
           <div class="quick">${[10000, 25000, 50000, 100000].map(v => `<button class="chip-btn" data-bq="${v}">${U.usd(v, { compact: true })}</button>`).join('')}</div>`
        : `<label class="fld-l">Size <span class="muted">(${p.ticker} rights)</span></label>
           <div class="amount-in"><input id="b-tok" type="text" inputmode="numeric" value="${U.num(ui.bidTokens)}"><em>${p.ticker}</em></div>
           <label class="fld-l">Bid price <span class="muted">(best bid ${bestBid ? U.price(bestBid.price) : '—'})</span></label>
           <div class="amount-in"><span>$</span><input id="b-px" type="text" inputmode="decimal" value="${ui.bidPrice}"><em>/${p.ticker}</em></div>`}
      <div class="calc" id="b-out"></div>
      <div class="note">${UI.icons.shield}<span>You receive <b>locked rights</b> that unlock pro-rata on the remaining schedule${nextStep ? ` — next unlock ${U.fmtDate(nextStep.date)}` : ''}. No penalty applies to buyers.</span></div>
      <button class="btn bid block lg" id="b-go">${ui.buyMode === 'market' ? 'Buy Rights' : 'Place Bid & Escrow USDT'}</button>`;
    const out = el.querySelector('#b-out'), go = el.querySelector('#b-go');
    const read = v => +String(v).replace(/[^\d.]/g, '') || 0;
    const draw = () => {
      if (ui.buyMode === 'market') {
        const sim = E.simulateMarketBuy(s, p.id, ui.buyUsd);
        out.innerHTML = `
          <div class="calc-row"><span>Rights received</span><b class="num">${U.num(sim.tokens)} ${p.ticker}</b></div>
          <div class="calc-row"><span>Average price (VWAP)</span><b class="num">${U.price(sim.vwap)}</b></div>
          <div class="calc-row"><span>Slippage vs best ask</span><b class="num">${U.pct(sim.slippage, 2)}</b></div>
          <div class="calc-row total"><span>Discount vs spot</span><b class="num pos">${sim.vwap ? U.pct(1 - sim.vwap / p.price, 1) : '—'}</b></div>
          ${sim.unspent > 1 ? `<div class="warn-s">Only ${U.usd(sim.spent)} fillable — ${U.usd(sim.unspent)} will not be spent.</div>` : ''}
          ${ui.buyUsd > s.user.balances.USDT ? '<div class="err">Insufficient USDT</div>' : ''}`;
        go.disabled = !(sim.tokens > 0 && ui.buyUsd <= s.user.balances.USDT);
      } else {
        const cost = ui.bidTokens * ui.bidPrice;
        const bestAsk = E.sortedAsks(s, p.id, true)[0];
        const crosses = bestAsk && ui.bidPrice >= bestAsk.price;
        out.innerHTML = `
          <div class="calc-row"><span>USDT escrowed</span><b class="num">${U.usd(cost)}</b></div>
          <div class="calc-row"><span>Discount vs spot</span><b class="num pos">${U.pct(1 - ui.bidPrice / p.price, 1)}</b></div>
          <div class="calc-row total"><span>Queue position</span><b class="num">#${E.sortedBids(s, p.id, false).filter(b => b.price >= ui.bidPrice).length + 1}</b></div>
          ${crosses ? `<div class="err">Crosses best ask ${U.price(bestAsk.price)} — use Market Buy</div>` : ''}
          ${cost > s.user.balances.USDT ? '<div class="err">Insufficient USDT</div>' : ''}`;
        go.disabled = !(cost > 0) || crosses || cost > s.user.balances.USDT;
      }
    };
    el.querySelectorAll('[data-bm]').forEach(b => b.addEventListener('click', () => { ui.buyMode = b.dataset.bm; SL.app.render(); }));
    const bu = el.querySelector('#b-usd'); bu && bu.addEventListener('input', () => { ui.buyUsd = read(bu.value); draw(); });
    el.querySelectorAll('[data-bq]').forEach(b => b.addEventListener('click', () => { ui.buyUsd = +b.dataset.bq; bu.value = U.num(ui.buyUsd); draw(); }));
    const bt = el.querySelector('#b-tok'); bt && bt.addEventListener('input', () => { ui.bidTokens = read(bt.value); draw(); });
    const bp = el.querySelector('#b-px'); bp && bp.addEventListener('input', () => { ui.bidPrice = read(bp.value); draw(); });
    go.addEventListener('click', () => {
      if (ui.buyMode === 'market') SL.app.act('BUY_MARKET', { projectId: p.id, usd: ui.buyUsd });
      else SL.app.act('PLACE_BID', { projectId: p.id, tokens: ui.bidTokens, price: ui.bidPrice });
    });
    draw();
  }
};
