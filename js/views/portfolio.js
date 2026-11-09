/* Portfolio · Active ICOs (cards/table, vesting rings, claim / early exit) + Historical deals */
window.SL = window.SL || {}; SL.views = SL.views || {};

SL.views.portfolio = {
  title: 'Portfolio & Vesting',
  ui: { tab: 'active', layout: 'cards' },
  render(root, s) {
    const U = SL.util, E = SL.engine, UI = SL.ui, C = SL.charts;
    const ui = this.ui, k = E.kpis(s), t = E.now(s);

    const card = g => {
      const p = g.project, col = C.seriesColor(p.colorSlot);
      const lots = g.lots.length > 1 ? `<span class="badge off">${g.lots.length} lots · ${g.lots.map(l => l.pos.source === 'otc' ? 'OTC' : 'Primary').join(' + ')}</span>` : (g.lots[0].pos.source === 'otc' ? '<span class="badge off">OTC lot</span>' : '');
      return `
      <article class="card pos-card">
        <header class="pos-h">
          ${UI.logo(p, 44)}
          <div class="li-main"><h3>${U.esc(p.name)} <span class="tick">${p.ticker}</span></h3><span class="muted">${U.esc(p.sector)} · ${p.chain}</span></div>
          ${UI.statusBadge(g.lots[0].preTge ? 'pre-tge' : 'vesting')}
        </header>
        <div class="pos-body">
          <div class="pos-ring">${C.ring(g.unlockPct, { size: 92, stroke: 7, color: col, claimed: g.claimedPct, sub: 'unlocked' })}</div>
          <dl class="pos-stats">
            <div><dt>My Commitment</dt><dd class="num">${U.usd(g.commitment)}</dd></div>
            <div><dt>Current Value</dt><dd class="num">${U.usd(g.value)} ${UI.multChip(g.multiple)}</dd></div>
            <div><dt>Entry → Mark</dt><dd class="num">${U.price(g.commitment / g.lots.reduce((a, l) => a + l.pos.tokens, 0))} → ${U.price(p.price)}${p.priceSource === 'otc-indicative' ? ' <span class="muted small">OTC ind.</span>' : ''}</dd></div>
            <div><dt>Next Unlock</dt><dd class="num">${g.nextUnlock ? `${U.fmtDateShort(g.nextUnlock.date)} · ${U.usd(g.nextUnlock.usd, { compact: true })}` : '<span class="muted">Fully vested</span>'}</dd></div>
          </dl>
        </div>
        <p class="vest-terms">${U.esc(E.vestingLabel(p))}${g.lots[0].preTge ? ` · TGE ${U.fmtDate(p.tgeDate)}` : ''}</p>
        ${UI.vestBar(g)}
        <div class="pos-tokens">
          <span><b class="num">${U.tokens(g.unlocked)}</b> unlocked</span>
          <span><b class="num">${U.tokens(g.locked)}</b> locked</span>
          <span><b class="num">${U.tokens(g.claimable)}</b> claimable</span>
          ${g.listedUsd ? `<span class="gold-t"><b class="num">${U.usd(g.listedUsd, { compact: true })}</b> listed on OTC</span>` : ''}
        </div>
        ${lots}
        <footer class="pos-actions">
          <button class="btn gold" data-claim="${p.id}" ${g.claimable < 1 ? 'disabled' : ''}>Claim Available${g.claimable >= 1 ? ` · ${U.usd(g.claimableUsd, { compact: true })}` : ''}</button>
          <button class="btn danger-ghost" data-exit="${p.id}" ${g.locked < 1 ? 'disabled' : ''}>Early Exit / Sell Rights</button>
        </footer>
      </article>`;
    };

    const table = gs => `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Project</th><th class="r">Commitment</th><th class="r">Value</th><th class="r">Multiple</th><th>Vesting</th><th class="r">Claimable</th><th class="r">Next unlock</th><th></th></tr></thead>
        <tbody>${gs.map(g => `<tr>
          <td><div class="row">${UI.logo(g.project, 30)}<div class="li-main"><b>${g.project.ticker}</b><span class="muted small">${U.esc(g.project.name)}</span></div></div></td>
          <td class="r num">${U.usd(g.commitment)}</td><td class="r num">${U.usd(g.value)}</td><td class="r">${UI.multChip(g.multiple)}</td>
          <td style="min-width:160px">${UI.progress(g.unlockPct, 'gold')}<span class="muted small">${U.pct(g.unlockPct, 0)} unlocked · ${U.tokens(g.locked)} locked</span></td>
          <td class="r num">${U.usd(g.claimableUsd)}</td>
          <td class="r num">${g.nextUnlock ? U.fmtDateShort(g.nextUnlock.date) : '—'}</td>
          <td class="r nowrap"><button class="btn sm gold" data-claim="${g.project.id}" ${g.claimable < 1 ? 'disabled' : ''}>Claim</button> <button class="btn sm danger-ghost" data-exit="${g.project.id}" ${g.locked < 1 ? 'disabled' : ''}>Exit</button></td>
        </tr>`).join('')}</tbody></table></div>`;

    const hist = k.history;
    const hTot = hist.reduce((a, h) => ({ c: a.c + h.commitment, p: a.p + h.proceeds }), { c: 0, p: 0 });
    const history = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Project</th><th>Held</th><th class="r">Entry</th><th class="r">Avg exit</th><th class="r">Invested</th><th class="r">Proceeds</th><th class="r">Net PnL</th><th class="r">ROI</th><th>Exit route</th></tr></thead>
        <tbody>${hist.map(h => `<tr>
          <td><div class="row"><span class="logo" style="--c:var(--text-2);--s:30px"><span>${h.ticker.slice(0, 2)}</span></span><div class="li-main"><b>${h.ticker}</b><span class="muted small">${U.esc(h.name)} · ${U.esc(h.sector)}</span></div></div></td>
          <td class="nowrap small">${U.fmtDateShort(h.investedAt)} ’${h.investedAt.slice(2, 4)} → ${U.fmtDateShort(h.closedAt)} ’${h.closedAt.slice(2, 4)}<br><span class="muted">${h.days} days</span></td>
          <td class="r num">${U.price(h.entryPrice)}</td><td class="r num">${U.price(h.avgExitPrice)}</td>
          <td class="r num">${U.usd(h.commitment)}</td><td class="r num">${U.usd(h.proceeds)}</td>
          <td class="r num">${UI.deltaText(h.pnl)}</td><td class="r">${UI.multChip(h.multiple)} <span class="small ${h.roi >= 0 ? 'pos' : 'neg'}">${U.pct(h.roi, 0, true)}</span></td>
          <td class="small muted">${U.esc(h.exitRoute)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4"><b>Total · ${hist.length} deals</b></td><td class="r num"><b>${U.usd(hTot.c)}</b></td><td class="r num"><b>${U.usd(hTot.p)}</b></td><td class="r num"><b>${UI.deltaText(hTot.p - hTot.c)}</b></td><td class="r">${UI.multChip(hTot.p / hTot.c)}</td><td></td></tr></tfoot>
      </table></div>`;

    root.innerHTML = `
      <section class="page-h">
        <div><p class="eyebrow">Vesting Ledger · Fractional Rights</p><h1 class="display">Portfolio & <em>Vesting</em></h1></div>
        <div class="seg" role="tablist">
          <button class="${ui.tab === 'active' ? 'on' : ''}" data-tab="active">My Active ICOs <span class="cnt">${k.groups.length}</span></button>
          <button class="${ui.tab === 'history' ? 'on' : ''}" data-tab="history">Historical <span class="cnt">${hist.length}</span></button>
        </div>
      </section>
      ${ui.tab === 'active' ? `
      <section class="strip">
        <div class="strip-i"><span class="muted">Claimable</span><b class="num">${U.usd(k.claimableUsd)}</b></div>
        <div class="strip-i"><span class="muted">Locked rights</span><b class="num">${U.usd(k.lockedUsd)}</b></div>
        <div class="strip-i"><span class="muted">Active cost basis</span><b class="num">${U.usd(k.activeCost)}</b></div>
        <div class="strip-i"><span class="muted">Unrealized</span><b class="num">${UI.deltaText(k.unrealized)}</b></div>
        <div class="strip-act">
          <div class="seg sm"><button class="${ui.layout === 'cards' ? 'on' : ''}" data-layout="cards">Cards</button><button class="${ui.layout === 'table' ? 'on' : ''}" data-layout="table">Table</button></div>
          <button class="btn gold" data-claimall ${k.claimableUsd < 1 ? 'disabled' : ''}>Claim All</button>
        </div>
      </section>
      ${ui.layout === 'cards' ? `<section class="pos-grid">${k.groups.map(card).join('')}</section>` : table(k.groups)}`
      : `<section class="strip">
          <div class="strip-i"><span class="muted">Invested</span><b class="num">${U.usd(hTot.c)}</b></div>
          <div class="strip-i"><span class="muted">Proceeds</span><b class="num">${U.usd(hTot.p)}</b></div>
          <div class="strip-i"><span class="muted">Net realized</span><b class="num">${UI.deltaText(hTot.p - hTot.c)}</b></div>
          <div class="strip-i"><span class="muted">Win rate (closed)</span><b class="num">${U.pct(hist.filter(h => h.multiple > 1).length / Math.max(1, hist.length), 0)}</b></div>
        </section>${history}`}`;

    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { ui.tab = b.dataset.tab; SL.app.render(); }));
    root.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => { ui.layout = b.dataset.layout; SL.app.render(); }));
    root.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => SL.app.claimProjectFlow(b.dataset.claim)));
    root.querySelectorAll('[data-exit]').forEach(b => b.addEventListener('click', () => SL.app.startExit(b.dataset.exit)));
    root.querySelector('[data-claimall]')?.addEventListener('click', () => SL.app.claimAllFlow());
  }
};
