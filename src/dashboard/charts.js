export function buildEquityCurveSvg(history, summary) {
  if (history.length < 2) return `<div class='k'>Not enough closed trades yet.</div>`;
  const w = 900, h = 240, padL = 42, padR = 18, padT = 16, padB = 32;
  let cum = 0;
  const series = history.map((x, i) => {
    cum += Number(x.pnl_sol || 0);
    return { i, t: x.closed_at_ms, v: cum, trade: Number(x.pnl_sol || 0) };
  });
  const max = Math.max(...series.map((s) => s.v), 0.0001);
  const min = Math.min(...series.map((s) => s.v), -0.0001);
  const range = Math.max(max - min, 0.05);
  const yFor = (v) => padT + ((max - v) / range) * (h - padT - padB);
  const xFor = (i) => padL + (i / Math.max(1, series.length - 1)) * (w - padL - padR);
  const points = series.map((s) => ({ ...s, x: xFor(s.i), y: yFor(s.v) }));
  let peakIdx = 0; let troughIdx = 0; let peakVal = points[0].v; let worstDd = 0;
  points.forEach((p, idx) => {
    if (p.v > peakVal) { peakVal = p.v; peakIdx = idx; }
    const dd = peakVal - p.v;
    if (dd > worstDd) { worstDd = dd; troughIdx = idx; }
  });
  const last = points[points.length - 1];
  const first = points[0];
  const netChange = last.v - first.v;
  const netClass = netChange >= 0 ? 'up' : 'dn';

  const gridLines = [];
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const value = min + (range * (yTicks - i) / yTicks);
    const y = yFor(value);
    gridLines.push(`<line x1='${padL}' y1='${y}' x2='${w - padR}' y2='${y}' stroke='${Math.abs(value) < 1e-9 ? '#334155' : '#1e293b'}' stroke-width='1' ${Math.abs(value) < 1e-9 ? "stroke-dasharray='4 4'" : ''}/>`);
    gridLines.push(`<text x='${padL - 8}' y='${y + 3}' fill='#64748b' font-size='10' text-anchor='end'>${value.toFixed(3)}</text>`);
  }
  const xLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map((idx, i) => `<text x='${points[idx].x}' y='${h - 8}' fill='#64748b' font-size='10' text-anchor='${i===0?'start':(i===2?'end':'middle')}'>${new Date(points[idx].t).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</text>`).join('');

  const areaPath = `M${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${last.x},${h-padB} L ${first.x},${h-padB} Z`;
  const linePath = `M${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const pointNodes = points.map((p, idx) => {
    const isLast = idx === points.length - 1;
    const fill = isLast ? '#22c55e' : '#60a5fa';
    const r = isLast ? 4.8 : 3.4;
    const date = new Date(p.t).toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<g class='eq-pt'><circle cx='${p.x}' cy='${p.y}' r='${r}' fill='${fill}' stroke='#0b1020' stroke-width='2'/><title>${date}\nCumulative: ${p.v.toFixed(4)} SOL\nTrade: ${p.trade >= 0 ? '+' : ''}${p.trade.toFixed(4)} SOL</title></g>`;
  }).join('');
  const peakPoint = points[peakIdx];
  const troughPoint = points[troughIdx];

  return `
    <div class='chart-header' style='display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap'>
      <div>
        <div style='color:#cbd5e1;font-size:14px;font-weight:600'>Equity Curve (cumulative SOL)</div>
        <div style='color:#94a5d4;font-size:12px'>Baseline dashed line = break-even (0 SOL)</div>
      </div>
      <div style='display:flex;gap:14px;font-size:12px;flex-wrap:wrap'>
        <div>Start: <b>${first.v.toFixed(4)} SOL</b></div>
        <div>Current: <b class='${netClass}'>${last.v.toFixed(4)} SOL</b></div>
        <div>Net: <b class='${netClass}'>${netChange >= 0 ? '+' : ''}${netChange.toFixed(4)} SOL</b></div>
      </div>
    </div>
    <svg viewBox='0 0 ${w} ${h}' preserveAspectRatio='none' style='width:100%;height:240px'>
      <defs><linearGradient id='eqFill' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stop-color='#60a5fa' stop-opacity='0.26'/><stop offset='100%' stop-color='#60a5fa' stop-opacity='0.03'/></linearGradient></defs>
      ${gridLines.join('')}
      <line x1='${padL}' y1='${padT}' x2='${padL}' y2='${h - padB}' stroke='#24314d'/>
      <line x1='${padL}' y1='${h - padB}' x2='${w - padR}' y2='${h - padB}' stroke='#24314d'/>
      <path d='${areaPath}' fill='url(#eqFill)'/>
      <path d='${linePath}' fill='none' stroke='#60a5fa' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/>
      <line x1='${peakPoint.x}' y1='${peakPoint.y}' x2='${troughPoint.x}' y2='${troughPoint.y}' stroke='#ef4444' stroke-dasharray='3 3' opacity='0.7'/>
      <text x='${troughPoint.x + 8}' y='${troughPoint.y - 6}' fill='#fca5a5' font-size='10'>Max DD ${(worstDd).toFixed(4)} SOL</text>
      <text x='${peakPoint.x + 8}' y='${peakPoint.y - 6}' fill='#93c5fd' font-size='10'>Peak</text>
      ${pointNodes}
      ${xLabels}
    </svg>
    <div style='display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:#94a5d4;font-size:12px'>
      <div><span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:6px'></span>Current point</div>
      <div><span style='display:inline-block;width:10px;height:2px;background:#60a5fa;margin-right:6px;vertical-align:middle'></span>Equity line</div>
      <div><span style='display:inline-block;width:10px;height:2px;background:#ef4444;margin-right:6px;vertical-align:middle'></span>Max drawdown span</div>
    </div>
  `;
}

export function buildHistogramSvg(history) {
  if (history.length < 2) return `<div class='k'>Not enough closed trades yet.</div>`;
  const buckets = [
    { label: '<-50%', min: -Infinity, max: -50, n: 0, color: '#ef4444' },
    { label: '-50..-20%', min: -50, max: -20, n: 0, color: '#f87171' },
    { label: '-20..0%', min: -20, max: 0, n: 0, color: '#fb923c' },
    { label: '0..20%', min: 0, max: 20, n: 0, color: '#a3e635' },
    { label: '20..50%', min: 20, max: 50, n: 0, color: '#22c55e' },
    { label: '>50%', min: 50, max: Infinity, n: 0, color: '#16a34a' },
  ];
  history.forEach((h) => {
    const v = Number(h.pnl_percent || 0);
    for (const b of buckets) { if (v >= b.min && v < b.max) { b.n += 1; break; } }
  });
  const total = history.length;
  const w = 600, h = 200, padL = 36, padR = 14, padT = 14, padB = 28;
  const maxN = Math.max(...buckets.map((b) => b.n), 1);
  const colW = (w - padL - padR) / buckets.length;
  const yTicks = 4;
  const yLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const value = Math.round((maxN * i) / yTicks);
    const y = h - padB - ((h - padT - padB) * i) / yTicks;
    yLines.push(`<line x1='${padL}' y1='${y}' x2='${w - padR}' y2='${y}' stroke='#1e293b'/>`);
    yLines.push(`<text x='${padL - 6}' y='${y + 3}' fill='#64748b' font-size='10' text-anchor='end'>${value}</text>`);
  }
  const winners = total ? buckets.slice(3).reduce((a, b) => a + b.n, 0) : 0;
  const losers = total ? buckets.slice(0, 3).reduce((a, b) => a + b.n, 0) : 0;
  const maxIdx = buckets.reduce((mi, b, i) => b.n > buckets[mi].n ? i : mi, 0);
  return `
    <div class='chart-header' style='display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap'>
      <div>
        <div style='color:#cbd5e1;font-size:14px;font-weight:600'>PnL Distribution (per trade)</div>
        <div style='color:#94a5d4;font-size:12px'>Buckets by % return · totals reported above each bar</div>
      </div>
      <div style='display:flex;gap:14px;font-size:12px;flex-wrap:wrap'>
        <div>Trades: <b>${total}</b></div>
        <div>Winners: <b class='up'>${winners}</b></div>
        <div>Losers: <b class='dn'>${losers}</b></div>
      </div>
    </div>
    <svg viewBox='0 0 ${w} ${h}' preserveAspectRatio='none' style='width:100%;height:200px'>
      ${yLines.join('')}
      <line x1='${padL}' y1='${padT}' x2='${padL}' y2='${h - padB}' stroke='#24314d'/>
      <line x1='${padL}' y1='${h - padB}' x2='${w - padR}' y2='${h - padB}' stroke='#24314d'/>
      ${buckets.map((b, i) => {
        const x = padL + i * colW + 6;
        const bw = colW - 12;
        const bh = ((h - padT - padB) * b.n) / maxN;
        const y = h - padB - bh;
        const stroke = i === maxIdx ? `<rect x='${x - 1.5}' y='${y - 1.5}' width='${bw + 3}' height='${bh + 3}' fill='none' stroke='#facc15' rx='5'/>` : '';
        return `<g><title>${b.label}\n${b.n} trades\n${total ? ((b.n / total) * 100).toFixed(1) + '%' : '0%'}</title>
          ${stroke}
          <rect x='${x}' y='${y}' width='${bw}' height='${bh}' fill='${b.color}' rx='4'/>
          <text x='${x + bw / 2}' y='${h - 8}' fill='#94a5d4' font-size='10' text-anchor='middle'>${b.label}</text>
          <text x='${x + bw / 2}' y='${y - 4}' fill='#dbe7ff' font-size='10' text-anchor='middle' font-weight='600'>${b.n}</text>
        </g>`;
      }).join('')}
    </svg>
  `;
}
