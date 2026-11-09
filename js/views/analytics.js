/* Analytics · 12-month interactive vesting calendar + Treasury (penalty pool) insights */
window.SL = window.SL || {}; SL.views = SL.views || {};

SL.views.analytics = {
  title: 'Calendar & Treasury',
  ui: { month: null, tab: 'calendar' },
  render(root, s) {
    const U = SL.util, E = SL.engine, UI = SL.ui, C = SL.charts, ui = this.ui;
    const t = E.now(s), cal = E.vestingCalendar(s, 12), tr = E.treasury(s);
    const projIds = [...new Set(cal.events.map(e => e.projectId))];
    const keys = s.projects.filter(p => projIds.includes(p.id)).sort((a, b) => a.colorSlot - b.colorSlot)
      .map(p => ({ id: p.id, label: p.ticker, color: C.seriesColor(p.colorSlot) }));
    const within = d => cal.events.filter(e => U.daysBetween(t, e.date) <= d).reduce((a, e) => a + e.usd, 0);
    if (ui.month && !cal.buckets.find(b => b.key === ui.month)) ui.month = null;
    const focusKey = ui.month || (cal.buckets.find(b => b.total > 0) || cal.buckets[0]).key;
    const listEvents = ui.month ? cal.events.filter(e => U.monthKey(e.date) === ui.month) : cal.events.slice(0, 12);

    /* month grid for the focused month */
    const monthGrid = key => {
      const first = U.parse(key + '-01'), dow = (first.getUTCDay() + 6) % 7;
      const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const evs = cal.events.filter(e => U.monthKey(e.date) === key);
      let cells = '';
      for (let i = 0; i < dow; i++) cells += '<span class="cal-c empty"></span>';
      for (let d = 1; d <= daysIn; d++) {
        const iso = `${key}-${String(d).padStart(2, '0')}`;
        const de = evs.filter(e => U.iso(e.date) === iso);
        const isToday = iso === U.iso(t);
        const total = de.reduce((a, e) => a + e.usd, 0);
        cells += `<span class="cal-c ${de.length ? 'has' : ''} ${isToday ? 'today' : ''}" ${de.length ? `title="${de.map(e => `${e.project.ticker} ${U.usd(e.usd)}`).join(' · ')}"` : ''}>
          <i>${d}</i>${de.length ? `<span class="cal-dots">${de.map(e => `<b style="background:${C.seriesColor(e.project.colorSlot)}"></b>`).join('')}</span><small class="num">${U.usd(total, { compact: true })}</small>` : ''}</span>`;
      }
      return `<div class="cal-head">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal-grid">${cells}</div>`;
    };

    const calendar = `
      <section class="kpi-grid three">
        ${UI.kpi({ icon: UI.icons.calendar, label: 'Next 30 days', value: U.usd(within(30)), sub: `${cal.events.filter(e => U.daysBetween(t, e.date) <= 30).length} unlock events` })}
        ${UI.kpi({ icon: UI.icons.calendar, label: 'Next 90 days', value: U.usd(within(90)), sub: 'Projected at current marks' })}
        ${UI.kpi({ icon: UI.icons.chart, label: '12-month cash-flow', value: U.usd(cal.total), sub: `${cal.events.length} unlocks across ${keys.length} projects`, accent: true })}
      </section>
      <section class="card">
        <header class="card-h"><div><h2>Vesting Cash-flow · Next 12 Months</h2><p class="muted">USDT value of unlocking tokens at current marks · click a month to drill in</p></div>
          <div class="legend">${keys.map(k => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join('')}</div></header>
        <div id="cal-bars" class="chart"></div>
      </section>
      <section class="grid-1-1">
        <article class="card">
          <header class="card-h"><div><h2>${U.fmtMonth(focusKey, true)}</h2><p class="muted">Claim dates</p></div>
            <div class="row gap">${ui.month ? '<button class="btn sm ghost" data-clear>Show all</button>' : ''}</div></header>
          ${monthGrid(focusKey)}
        </article>
        <article class="card">
          <header class="card-h"><div><h2>${ui.month ? 'Unlocks in ' + U.fmtMonth(ui.month, true) : 'Upcoming Unlocks'}</h2><p class="muted">${ui.month ? U.usd(listEvents.reduce((a, e) => a + e.usd, 0)) + ' total' : 'Next 12 events'}</p></div></header>
          <ul class="list">${listEvents.map(e => `
            <li class="li"><div class="date-tile"><b>${U.parse(e.date).getUTCDate()}</b><span>${U.MONTHS[U.parse(e.date).getUTCMonth()]}</span></div>
              ${UI.logo(e.project, 30)}
              <div class="li-main"><b>${e.project.name}${e.isTge ? ' <span class="badge pre">TGE</span>' : ''}</b><span class="muted">${U.num(e.tokens)} ${e.project.ticker} · in ${UI.countdown(e.date, t)}</span></div>
              <b class="num">${U.usd(e.usd)}</b></li>`).join('') || UI.empty('No unlocks this month')}</ul>
        </article>
      </section>`;

    const curKey = U.monthKey(t);
    const treasury = `
      <section class="kpi-grid">
        ${UI.kpi({ icon: UI.icons.vault, label: 'Total penalties collected', value: U.usd(tr.totalCollected), sub: 'All-time · 20% early-exit fees', accent: true })}
        ${UI.kpi({ icon: UI.icons.out, label: 'Distributed to members', value: U.usd(tr.totalDistributed), sub: `${U.pct(tr.rate, 0)} distribution rate`, foot: UI.progress(tr.totalDistributed / tr.totalCollected, 'gold') })}
        ${UI.kpi({ icon: UI.icons.shield, label: 'Treasury balance', value: U.usd(tr.balance), sub: `Reserve ${U.pct(1 - tr.rate, 0)} + pending pool ${U.usd(tr.pendingPool, { compact: true })}` })}
        ${UI.kpi({ icon: UI.icons.target, label: 'My pro-rata share', value: U.pct(tr.userShare, 2), sub: `${s.user.tier} boost ×${tr.boost} · ~${U.pct(tr.apr, 2)} APR on cost`, foot: `${tr.membersCount} members` })}
        ${UI.kpi({ icon: UI.icons.profit, label: 'My accrued yield', value: U.usd(tr.userAccrued), sub: `Claimed to date ${U.usd(tr.userClaimed)}`, foot: `<button class="link" data-yield ${tr.userAccrued <= 0 ? 'disabled' : ''}>Claim yield →</button>` })}
        ${UI.kpi({ icon: UI.icons.calendar, label: 'Next distribution', value: U.fmtDate(tr.nextDistribution), sub: `Est. your cut ${U.usd(tr.userProjected)} (MTD pool)` })}
      </section>
      <section class="grid-2-1">
        <article class="card">
          <header class="card-h"><div><h2>Monthly Penalty Inflows</h2><p class="muted">Early-exit penalties routed to the Treasury · current month in progress</p></div></header>
          <div id="tr-bars" class="chart"></div>
        </article>
        <article class="card">
          <header class="card-h"><div><h2>Distribution Policy</h2><p class="muted">How every penalty dollar is split</p></div></header>
          <div class="split"><span style="flex:${tr.rate}" class="sp-a">${U.pct(tr.rate, 0)}</span><span style="flex:${1 - tr.rate}" class="sp-b">${U.pct(1 - tr.rate, 0)}</span></div>
          <ul class="policy">
            <li><i class="sp-a"></i><div><b>Member yield</b><span class="muted">Distributed monthly, pro-rata to active commitment. Abyssal tier ×1.25 boost.</span></div></li>
            <li><i class="sp-b"></i><div><b>Protocol reserve</b><span class="muted">Backstops OTC liquidity and covers escrow / audit costs.</span></div></li>
          </ul>
        </article>
      </section>
      <section class="card">
        <header class="card-h"><div><h2>Recent Penalty Events</h2><p class="muted">Anonymised early exits</p></div></header>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Market</th><th class="r">Exit amount</th><th class="r">Penalty → Treasury</th><th class="r">To members (${U.pct(tr.rate, 0)})</th></tr></thead><tbody>
          ${tr.recent.slice(0, 8).map(r => `<tr class="${r.mine ? 'mine' : ''}"><td>${U.fmtDate(r.date)}</td><td><b>${r.ticker}</b>${r.mine ? ' <span class="you">YOU</span>' : ''}</td><td class="r num">${U.usd(r.grossUsd)}</td><td class="r num gold-t">${U.usd(r.penaltyUsd)}</td><td class="r num">${U.usd(r.penaltyUsd * tr.rate)}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;

    root.innerHTML = `
      <section class="page-h">
        <div><p class="eyebrow">Advanced analytics</p><h1 class="display">${ui.tab === 'calendar' ? 'Vesting <em>Calendar</em>' : 'Treasury <em>Pool</em>'}</h1></div>
        <div class="seg"><button class="${ui.tab === 'calendar' ? 'on' : ''}" data-tab="calendar">Vesting Calendar</button><button class="${ui.tab === 'treasury' ? 'on' : ''}" data-tab="treasury">Treasury</button></div>
      </section>
      ${ui.tab === 'calendar' ? calendar : treasury}`;

    if (ui.tab === 'calendar') {
      C.stacked(U.$('#cal-bars', root), { buckets: cal.buckets, keys, height: 270, selected: ui.month, onSelect: k => { ui.month = k; SL.app.render(); } });
      root.querySelector('[data-clear]')?.addEventListener('click', () => { ui.month = null; SL.app.render(); });
    } else {
      const ms = tr.months;
      C.bars(U.$('#tr-bars', root), {
        labels: ms.map(m => U.fmtMonth(m.month)), values: ms.map(m => m.penalties), height: 230, tipLabel: 'Penalties collected',
        highlight: ms.findIndex(m => m.month === curKey),
        extra: i => `<div class="tip-row"><span>Distributed (${U.pct(tr.rate, 0)})</span><b>${ms[i].distributed ? U.usd(ms[i].distributed) : 'pending'}</b></div>`
      });
      root.querySelector('[data-yield]')?.addEventListener('click', () => SL.app.act('CLAIM_YIELD'));
    }
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { ui.tab = b.dataset.tab; SL.app.render(); }));
  }
};
