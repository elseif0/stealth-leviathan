/* Overview · Global portfolio summary (KPI A–F), value chart, allocation, next unlocks, live deals, activity */
window.SL = window.SL || {}; SL.views = SL.views || {};

SL.views.overview = {
  title: 'Overview',
  render(root, s) {
    const U = SL.util, E = SL.engine, UI = SL.ui, C = SL.charts;
    const k = E.kpis(s), cal = E.vestingCalendar(s, 12);
    const live = s.projects.filter(p => E.dealStatus(s, p) === 'live');
    const t = E.now(s);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const next30 = cal.events.filter(e => U.daysBetween(t, e.date) <= 30).reduce((a, e) => a + e.usd, 0);

    root.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">Syndicate Command · ${U.fmtDate(t)}</p>
        <h1 class="display">${greet}, <em>${U.esc(s.user.alias)}</em></h1>
        <p class="hero-sub">${U.usd(k.claimableUsd)} ready to claim · ${U.usd(next30)} unlocking in the next 30 days · ${live.length} live deal${live.length === 1 ? '' : 's'} in the Deal Room</p>
      </div>
      <div class="hero-actions">
        <button class="btn gold" data-act="claim-all" ${k.claimableUsd < 1 ? 'disabled' : ''}>${UI.icons.unlock} Claim All · ${U.usd(k.claimableUsd, { compact: true })}</button>
        <a class="btn ghost" href="#deals">${UI.icons.deals} Deal Room</a>
      </div>
    </section>

    <section class="kpi-grid" aria-label="Portfolio metrics">
      ${UI.kpi({ icon: UI.icons.vault, label: 'Total Invested', value: U.usd(k.totalInvested), sub: `${U.usd(k.activeCost, { compact: true })} active · ${U.usd(k.histCost, { compact: true })} closed`, foot: k.lastInvestment ? `Last deposit <b class="num">${U.usd(k.lastInvestment.amount)}</b> · ${U.fmtDate(k.lastInvestment.date)}` : '' })}
      ${UI.kpi({ icon: UI.icons.chart, label: 'Current Portfolio Value', value: U.usd(k.currentValue), sub: `Unrealized ${UI.deltaText(k.unrealized)}`, foot: `${U.usd(k.lockedUsd, { compact: true })} locked · ${U.usd(k.claimableUsd, { compact: true })} open`, accent: true })}
      ${UI.kpi({ icon: UI.icons.profit, label: 'Realized PnL', value: `<span class="${k.realized >= 0 ? 'pos' : 'neg'}">${U.usd(k.realized, { sign: true })}</span>`, sub: `ROI ${UI.deltaText(k.realizedRoi, v => U.pct(v, 1, true))} on realized cost`, foot: `${k.history.length} closed deals + partial exits` })}
      ${UI.kpi({ icon: UI.icons.unlock, label: 'Claimable Now', value: U.usd(k.claimableUsd), sub: `${k.positions.filter(m => m.claimable >= 1).length} tranches vested`, foot: `<button class="link" data-act="claim-all" ${k.claimableUsd < 1 ? 'disabled' : ''}>Claim to Safe →</button>` })}
      ${UI.kpi({ icon: UI.icons.out, label: 'Total Withdrawn', value: U.usd(k.totalWithdrawn), sub: `Claims ${U.usd(k.withdrawnClaims, { compact: true })} · Exits ${U.usd(k.withdrawnHistory + k.withdrawnExits, { compact: true })}`, foot: k.lastWithdrawal ? `Last withdrawal <b class="num">${U.usd(k.lastWithdrawal.amount)}</b> · ${U.fmtDate(k.lastWithdrawal.date)}` : '' })}
      ${UI.kpi({ icon: UI.icons.target, label: 'Overall ROI · Win Rate', value: `<span class="${k.overallRoi >= 0 ? 'pos' : 'neg'}">${U.pct(k.overallRoi, 1, true)}</span><small> · ${U.pct(k.winRate, 0)}</small>`, sub: `${k.wins} of ${k.dealsCount} deals profitable`, foot: UI.progress(k.winRate, 'gold') })}
    </section>

    <section class="grid-2-1">
      <article class="card">
        <header class="card-h"><div><h2>Portfolio Value</h2><p class="muted">Open positions (mark-to-market) vs capital at work</p></div>
          <div class="legend"><span><i style="background:var(--gold)"></i>Portfolio value</span><span><i class="dash" style="border-color:var(--text-2)"></i>Capital at work</span></div></header>
        <div id="ov-line" class="chart"></div>
      </article>
      <article class="card">
        <header class="card-h"><div><h2>Allocation</h2><p class="muted">Current value by project</p></div></header>
        <div class="donut-wrap"><div id="ov-donut"></div>
          <ul class="legend-list">${k.groups.map(g => `<li><i style="background:${C.seriesColor(g.project.colorSlot)}"></i><span>${g.project.ticker}</span><b class="num">${U.pct(g.value / k.currentValue, 1)}</b></li>`).join('')}</ul></div>
      </article>
    </section>

    <section class="grid-3">
      <article class="card">
        <header class="card-h"><div><h2>Next Unlocks</h2><p class="muted">Upcoming vesting cash-flow</p></div><a class="link" href="#analytics">Calendar →</a></header>
        <ul class="list">${cal.events.slice(0, 6).map(e => `
          <li class="li">
            ${UI.logo(e.project, 34)}
            <div class="li-main"><b>${e.project.ticker}${e.isTge ? ' <span class="badge pre">TGE</span>' : ''}</b><span class="muted">${U.fmtDate(e.date)} · in ${UI.countdown(e.date, t)}</span></div>
            <div class="li-end"><b class="num">${U.usd(e.usd)}</b><span class="muted num">${U.tokens(e.tokens)} ${e.project.ticker}</span></div>
          </li>`).join('') || UI.empty('No unlocks scheduled')}</ul>
      </article>
      <article class="card">
        <header class="card-h"><div><h2>Live in Deal Room</h2><p class="muted">Opt-in allocations</p></div><a class="link" href="#deals">All deals →</a></header>
        <div class="mini-deals">${live.map(p => `
          <a class="mini-deal" href="#deals">
            <div class="row">${UI.logo(p, 34)}<div class="li-main"><b>${U.esc(p.name)}</b><span class="muted">${U.esc(p.sector)}</span></div>${UI.statusBadge('live')}</div>
            ${UI.progress(p.filled / p.totalPool, 'gold')}
            <div class="row between small"><span class="muted">${U.pct(p.filled / p.totalPool, 0)} filled · FDV ${U.usd(p.fdv, { compact: true })}</span><span class="muted">closes in ${UI.countdown(p.closesAt, t)}</span></div>
          </a>`).join('') || UI.empty('No live deals right now')}</div>
      </article>
      <article class="card">
        <header class="card-h"><div><h2>Activity</h2><p class="muted">On-chain ledger</p></div></header>
        <ul class="list compact">${s.ledger.slice(0, 7).map(l => `
          <li class="li"><span class="dot-type t-${l.type}"></span>
            <div class="li-main"><b class="small">${U.esc(l.label)}</b><span class="muted">${U.fmtDate(l.date)}</span></div>
            <b class="num small ${l.amount > 0 ? 'pos' : l.amount < 0 ? '' : 'muted'}">${l.amount ? U.usd(l.amount, { sign: true }) : '—'}</b></li>`).join('')}</ul>
      </article>
    </section>`;

    // charts
    const hist = s.portfolioHistory.slice();
    hist.push({ month: U.monthKey(t), invested: k.activeCost, value: k.currentValue });
    C.line(U.$('#ov-line', root), {
      labels: hist.map(h => U.fmtMonth(h.month)),
      series: [
        { name: 'Portfolio value', color: 'var(--gold)', values: hist.map(h => h.value) },
        { name: 'Capital at work', color: 'var(--text-2)', values: hist.map(h => h.invested), dash: true }
      ], height: 250
    });
    C.donut(U.$('#ov-donut', root), {
      items: k.groups.map(g => ({ label: `${g.project.name} (${g.project.ticker})`, value: g.value, color: C.seriesColor(g.project.colorSlot) })),
      size: 170, thickness: 16, center: U.usd(k.currentValue, { compact: true }), sub: 'Total value'
    });
    root.querySelectorAll('[data-act="claim-all"]').forEach(b => b.addEventListener('click', () => SL.app.claimAllFlow()));
  }
};
