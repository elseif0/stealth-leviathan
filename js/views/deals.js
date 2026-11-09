/* Deal Room · Live / upcoming allocations, pledge interface with live vesting scenarios, escrowed pledges */
window.SL = window.SL || {}; SL.views = SL.views || {};

SL.views.deals = {
  title: 'Deal Room',
  ui: { filter: 'all' },
  render(root, s) {
    const U = SL.util, E = SL.engine, UI = SL.ui;
    const ui = this.ui, t = E.now(s);
    const st = p => E.dealStatus(s, p);
    const deals = s.projects.filter(p => ['live', 'upcoming'].includes(st(p)) && (ui.filter === 'all' || st(p) === ui.filter))
      .sort((a, b) => (st(a) === 'live' ? 0 : 1) - (st(b) === 'live' ? 0 : 1) || U.parse(a.closesAt) - U.parse(b.closesAt));
    const pledges = s.pledges.filter(p => p.status === 'escrowed');
    const myPledge = id => pledges.filter(p => p.projectId === id).reduce((a, p) => a + p.amount, 0);

    const dealCard = p => {
      const fill = p.filled / p.totalPool, mine = myPledge(p.id), v = p.vesting;
      const status = st(p), live = status === 'live';
      return `
      <article class="card deal ${live ? 'is-live' : ''}">
        <header class="deal-h">
          ${UI.logo(p, 48)}
          <div class="li-main"><h3>${U.esc(p.name)} <span class="tick">${p.ticker}</span></h3><span class="muted">${U.esc(p.sector)} · ${p.chain}</span></div>
          <div class="deal-status">${UI.statusBadge(status)}<span class="muted small">${live ? `closes in ${UI.countdown(p.closesAt, t)}` : `opens ${U.fmtDateShort(p.opensAt)}`}</span></div>
        </header>
        <p class="deal-sum">${U.esc(p.summary)}</p>
        <div class="tags">${p.highlights.map(h => `<span class="tag">${U.esc(h)}</span>`).join('')}<span class="tag risk-${p.risk.toLowerCase()}">Risk · ${p.risk}</span></div>
        <dl class="deal-stats">
          <div><dt>Valuation (FDV)</dt><dd class="num">${U.usd(p.fdv, { compact: true })}</dd></div>
          <div><dt>Token Price</dt><dd class="num">${U.price(p.tokenPrice)}</dd></div>
          <div><dt>Total Pool</dt><dd class="num">${U.usd(p.totalPool, { compact: true })}</dd></div>
          <div><dt>Ticket</dt><dd class="num">${U.usd(p.minAlloc, { compact: true })} – ${U.usd(p.maxAlloc, { compact: true })}</dd></div>
        </dl>
        <div class="vest-chips">
          <span><b>${U.pct(v.tgePct, 0)}</b> TGE</span><span><b>${v.cliffMonths}m</b> cliff</span><span><b>${v.linearMonths}m</b> linear</span><span><b>${U.fmtDateShort(p.tgeDate)} ’${p.tgeDate.slice(2, 4)}</b> TGE est.</span>
        </div>
        <div class="fill">
          <div class="row between small"><span>${live ? 'Syndicate commitments' : 'Allocation opens soon'}</span><b class="num">${U.usd(p.filled, { compact: true })} / ${U.usd(p.totalPool, { compact: true })} · ${U.pct(fill, 0)}</b></div>
          ${UI.progress(fill, 'gold')}
        </div>
        ${mine ? `<div class="my-pledge">${UI.icons.shield}<span>Your pledge <b class="num">${U.usd(mine)}</b> is escrowed in the allocation contract</span></div>` : ''}
        <footer class="deal-f">
          ${live ? `<button class="btn gold block" data-pledge="${p.id}">${mine ? 'Increase Allocation' : 'Commit Allocation'}</button>`
                 : `<button class="btn ghost block" disabled>Opens ${U.fmtDate(p.opensAt)}</button>`}
        </footer>
      </article>`;
    };

    root.innerHTML = `
      <section class="page-h">
        <div><p class="eyebrow">Opt-in · No forced pool exposure</p><h1 class="display">Deal <em>Room</em></h1></div>
        <div class="seg">${['all', 'live', 'upcoming'].map(f => `<button class="${ui.filter === f ? 'on' : ''}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
      </section>
      <section class="deal-grid">${deals.map(dealCard).join('') || UI.empty('No deals match this filter')}</section>
      <section class="card">
        <header class="card-h"><div><h2>My Escrowed Pledges</h2><p class="muted">USDT/USDC locked in allocation contracts until the deal closes</p></div></header>
        ${pledges.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Deal</th><th>Date</th><th class="r">Amount</th><th class="r">Est. tokens</th><th>Status</th><th>Tx</th><th></th></tr></thead><tbody>
        ${pledges.map(pl => { const p = E.project(s, pl.projectId); return `<tr>
          <td><div class="row">${UI.logo(p, 28)}<b>${p.ticker}</b></div></td><td>${U.fmtDate(pl.date)}</td>
          <td class="r num">${U.usd(pl.amount)} <span class="muted small">${pl.currency}</span></td><td class="r num">${U.tokens(pl.amount / p.tokenPrice)}</td>
          <td><span class="badge pre">${UI.icons.shield} Escrowed</span></td><td class="mono small muted">${U.esc(pl.txHash)}</td>
          <td class="r">${E.dealStatus(s, p) === 'live' ? `<button class="btn sm ghost" data-cancel="${pl.id}">Withdraw</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : UI.empty('No active pledges. Choose a live deal above to commit.')}
      </section>`;

    root.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { ui.filter = b.dataset.filter; SL.app.render(); }));
    root.querySelectorAll('[data-pledge]').forEach(b => b.addEventListener('click', () => SL.views.deals.openPledge(b.dataset.pledge)));
    root.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => SL.app.act('CANCEL_PLEDGE', { id: b.dataset.cancel })));
  },

  /* ----------------------- Pledge / Commitment interface ----------------------- */
  openPledge(projectId) {
    const U = SL.util, E = SL.engine, UI = SL.ui, s = SL.store.get();
    const p = E.project(s, projectId);
    const already = s.pledges.filter(x => x.projectId === projectId && x.status === 'escrowed').reduce((a, x) => a + x.amount, 0);
    const maxForMe = Math.max(0, Math.min(p.maxAlloc - already, p.totalPool - p.filled));
    const start = Math.min(maxForMe, Math.max(p.minAlloc, 25000));
    const quick = [p.minAlloc, 25000, 50000, maxForMe].filter((v, i, a) => v >= p.minAlloc && v <= maxForMe && a.indexOf(v) === i);

    UI.modal({
      title: `${UI.logo(p, 28)} Commit to ${U.esc(p.name)}`, width: 600,
      body: `
        <div class="pledge">
          <label class="fld-l">Allocation amount</label>
          <div class="amount-in"><span>$</span><input id="pl-amt" type="text" inputmode="numeric" value="${U.num(start)}" autocomplete="off"><select id="pl-cur"><option>USDT</option><option>USDC</option></select></div>
          <input id="pl-range" type="range" min="${p.minAlloc}" max="${Math.max(p.minAlloc, maxForMe)}" step="1000" value="${start}">
          <div class="quick">${quick.map(v => `<button class="chip-btn" data-q="${v}">${v === maxForMe ? 'Max' : U.usd(v, { compact: true })}</button>`).join('')}</div>
          <p class="muted small" id="pl-bal"></p>
          <div class="calc" id="pl-out"></div>
          <div class="note">${UI.icons.shield}<span>Funds are locked in the allocation smart contract until close. Pro-rata refunds apply if the round is oversubscribed. You can withdraw while the deal is live.</span></div>
          <button class="btn gold block lg" id="pl-go">Submit Allocation Request</button>
        </div>`,
      onMount(m, close) {
        const amt = m.querySelector('#pl-amt'), rng = m.querySelector('#pl-range'), cur = m.querySelector('#pl-cur');
        const out = m.querySelector('#pl-out'), go = m.querySelector('#pl-go'), bal = m.querySelector('#pl-bal');
        const read = () => +String(amt.value).replace(/[^\d.]/g, '') || 0;
        const draw = () => {
          const a = read(), sc = E.pledgeScenario(s, projectId, a), b = s.user.balances[cur.value] || 0;
          const errs = sc.errors.slice(); if (a > b) errs.push(`Insufficient ${cur.value} (balance ${U.usd(b)})`);
          bal.innerHTML = `Wallet: <b>${U.usd(s.user.balances.USDT)}</b> USDT · <b>${U.usd(s.user.balances.USDC)}</b> USDC · Your cap left: <b>${U.usd(maxForMe)}</b>`;
          out.innerHTML = `
            <div class="calc-row"><span>Tokens allocated</span><b class="num">${U.num(sc.tokens)} ${p.ticker}</b></div>
            <div class="calc-row"><span>Estimated TGE unlock <em>${U.pct(p.vesting.tgePct, 0)}</em></span><b class="num">${U.num(sc.tgeTokens)} · ${U.usd(sc.tgeUsd)}</b></div>
            <div class="calc-row"><span>Monthly unlock after ${p.vesting.cliffMonths}m cliff <em>${U.pct(sc.monthlyPct, 2)}/mo</em></span><b class="num">${U.num(sc.monthlyTokens)} · ${U.usd(sc.monthlyUsd)}</b></div>
            <div class="calc-row"><span>Schedule</span><b>TGE ${U.fmtDate(p.tgeDate)} → first linear ${sc.firstLinear ? U.fmtDate(sc.firstLinear) : '—'} → fully vested ${U.fmtDate(sc.fullyVested)}</b></div>
            <div class="calc-row"><span>Share of pool</span><b class="num">${U.pct(sc.share, 2)}</b></div>
            <div class="scen"><span class="muted small">Illustrative value at token multiples (not a forecast)</span>
              <div class="scen-row"><div><span>0.5x</span><b class="num neg">${U.usd(sc.bear, { compact: true })}</b></div><div><span>2.5x</span><b class="num">${U.usd(sc.base, { compact: true })}</b></div><div><span>6x</span><b class="num pos">${U.usd(sc.bull, { compact: true })}</b></div></div></div>
            ${errs.length ? `<div class="err">${U.esc(errs[0])}</div>` : ''}`;
          go.disabled = errs.length > 0;
          go.textContent = errs.length ? 'Submit Allocation Request' : `Submit Allocation Request · ${U.usd(a)} ${cur.value}`;
        };
        amt.addEventListener('input', () => { const a = read(); rng.value = a; draw(); });
        amt.addEventListener('blur', () => { amt.value = U.num(read()); });
        rng.addEventListener('input', () => { amt.value = U.num(+rng.value); draw(); });
        cur.addEventListener('change', draw);
        m.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { amt.value = U.num(+b.dataset.q); rng.value = b.dataset.q; draw(); }));
        go.addEventListener('click', () => { const r = SL.app.act('PLEDGE', { projectId, amount: read(), currency: cur.value }); if (r.ok) close(); });
        draw();
      }
    });
  }
};
