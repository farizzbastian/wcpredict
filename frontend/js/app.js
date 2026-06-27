/* ===== APP.JS — Main UI logic ===== */

// ---- Utilities ----
function getRatingClass(r) {
  if (r >= 8.0) return 'rating-high';
  if (r >= 7.0) return 'rating-mid';
  return 'rating-low';
}
function getStatusIcon(s) {
  if (s === 'fit')        return '<span title="Fit">✅</span>';
  if (s === 'injured')    return '<span title="Injured" style="color:var(--accent-red)">🩹</span>';
  if (s === 'suspended')  return '<span title="Suspended" style="color:var(--accent-red)">🟥</span>';
  if (s === 'rotation')   return '<span title="Rotation Risk" style="color:var(--accent-yellow)">🔄</span>';
  return '';
}
function confidenceColor(c) {
  if (c >= 75) return 'var(--accent-green)';
  if (c >= 55) return 'var(--accent-yellow)';
  return 'var(--accent-red)';
}
function confidenceLabel(c) {
  if (c == null || Number.isNaN(Number(c))) return { badge: 'badge-partial', text: 'Pending' };
  if (c >= 75) return { badge: 'badge-high', text: 'High' };
  if (c >= 55) return { badge: 'badge-medium', text: 'Medium' };
  return { badge: 'badge-low', text: 'Low' };
}
function pagePath(file) {
  return window.location.pathname.includes('/pages/') ? file : `pages/${file}`;
}
function detailUrl(matchId) {
  return `${pagePath('detail.html')}?id=${encodeURIComponent(matchId)}`;
}
function comparisonUrl(matchId) {
  const query = matchId ? `?id=${encodeURIComponent(matchId)}` : '';
  return `${pagePath('comparison.html')}${query}`;
}
function displayPercent(value) {
  return value == null || Number.isNaN(Number(value)) ? 'N/A' : `${value}%`;
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '';
}
function teamLabel(team, flagAfter = false) {
  const flag = team?.flag || '';
  const name = team?.name || 'Tim';
  return flagAfter ? `${name} ${flag}`.trim() : `${flag} ${name}`.trim();
}
function formatNum(value, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return `${value}${suffix}`;
}

// ---- Render Match Cards (index.html) ----
function renderMatchCards(list, containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = list.map(m => {
    const cl = confidenceLabel(m.confidence);
    const confidenceWidth = m.confidence == null || Number.isNaN(Number(m.confidence)) ? 0 : m.confidence;
    const confidenceText = displayPercent(m.confidence);
    const isLive = m.status === 'live';
    const isFinished = m.status === 'finished';
    let centerContent = `<div class="vs-text">VS</div>`;
    if (isLive && m.liveScore) {
      centerContent = `
        <div class="live-score">${m.liveScore.a} - ${m.liveScore.b}</div>
        <div class="score-time">${m.liveScore.minute}'</div>
      `;
    } else if (isFinished && m.liveScore) {
      centerContent = `<div class="live-score" style="color:var(--text-secondary)">${m.liveScore.a} - ${m.liveScore.b}</div>`;
    }
    return `
    <article class="match-card fade-up" onclick="location.href='${detailUrl(m.id)}'">
      <div class="match-card-header">
        <span class="match-phase">⚽ ${m.phase} · ${m.group}</span>
        ${isLive ? '<span class="badge badge-live">Live</span>' : isFinished ? '<span class="badge badge-finished">Finished</span>' : '<span class="badge badge-upcoming">Upcoming</span>'}
      </div>
      <div class="match-teams">
        <div class="team-info team-a">
          <span class="team-flag">${m.flagA}</span>
          <div class="team-name">${m.teamA}</div>
          <div class="team-rank">FIFA #${m.rankA}</div>
        </div>
        <div class="vs-divider">${centerContent}</div>
        <div class="team-info team-b">
          <span class="team-flag">${m.flagB}</span>
          <div class="team-name">${m.teamB}</div>
          <div class="team-rank">FIFA #${m.rankB}</div>
        </div>
      </div>
      <div class="match-meta">
        <span>🕐 ${m.time}</span>
        <span>📍 ${m.city}</span>
        <span>🏟️ ${m.stadium}</span>
      </div>
      <div class="match-card-footer">
        <div class="confidence-mini">
          <div class="conf-bar"><div class="conf-fill" style="width:${confidenceWidth}%"></div></div>
          <span>${confidenceText}</span>
          <span class="badge ${cl.badge}">${cl.text}</span>
        </div>
        <button class="btn btn-primary btn-sm">Lihat Prediksi →</button>
      </div>
    </article>`;
  }).join('');
}

// ---- Render Detail Page ----
function renderDetailPage(data) {
  if (!data) return;

  // Match Header
  const statusBadge = data.status === 'live'
    ? '<span class="badge badge-live">● Live</span>'
    : data.status === 'finished'
    ? '<span class="badge badge-finished">Finished</span>'
    : '<span class="badge badge-upcoming">Upcoming</span>';

  const centerVs = data.prediction.score
    ? `<div class="predicted-score-display" style="margin:0;background:transparent;border:none;padding:6px">
        <span class="score-num a">${data.prediction.score.split('-')[0]}</span>
        <span class="score-dash">—</span>
        <span class="score-num b">${data.prediction.score.split('-')[1]}</span>
       </div>`
    : `<div class="vs-big">VS</div>`;

  document.getElementById('match-header').innerHTML = `
    <div class="match-header-panel fade-up">
      <div class="match-header-top">
        <div style="display:flex;gap:8px;align-items:center">
          <span class="match-phase-pill">⚽ ${data.phase} · ${data.group}</span>
          ${statusBadge}
        </div>
        <div class="match-meta-small">
          <span>📅 ${data.date} ${data.time}</span>
          <span>🏟️ ${data.stadium}</span>
          <span>📍 ${data.city}</span>
        </div>
      </div>
      <div class="match-header-teams">
        <div class="team-block team-a">
          <span class="flag-big">${data.teamA.flag}</span>
          <div class="name-big">${data.teamA.name}</div>
          <div class="team-stats-row">
            <span class="team-stat-pill">FIFA <strong>#${data.teamA.rank}</strong></span>
            <span class="team-stat-pill">🌡️ <strong>${data.teamA.avgTemp}°C</strong></span>
            <span class="team-stat-pill">GDP <strong>$${data.teamA.gdp.toLocaleString()}</strong></span>
          </div>
        </div>
        <div class="center-block">
          <div class="vs-badge">${centerVs}</div>
          <div class="match-date-center">${data.date} · ${data.time}</div>
        </div>
        <div class="team-block team-b">
          <span class="flag-big">${data.teamB.flag}</span>
          <div class="name-big">${data.teamB.name}</div>
          <div class="team-stats-row">
            <span class="team-stat-pill">FIFA <strong>#${data.teamB.rank}</strong></span>
            <span class="team-stat-pill">🌡️ <strong>${data.teamB.avgTemp}°C</strong></span>
            <span class="team-stat-pill">GDP <strong>$${data.teamB.gdp.toLocaleString()}</strong></span>
          </div>
        </div>
      </div>
      <div class="match-header-bottom">
        <div class="conf-display">
          <div class="conf-value">${data.prediction.confidence}%</div>
          <div class="conf-label">Prediction Confidence</div>
          <div class="conf-bar-wrap" style="width:140px"><div class="conf-bar-fill" style="width:${data.prediction.confidence}%"></div></div>
        </div>
        <div class="conf-display">
          <div class="conf-value" style="font-size:1.2rem">${data.totalScore.a} <span style="color:var(--text-muted);font-size:0.8rem">vs</span> ${data.totalScore.b}</div>
          <div class="conf-label">Total Score (out of ${data.totalScore.max})</div>
        </div>
        <div class="conf-display">
          <div class="conf-value" style="font-size:1.2rem">${data.prediction.completeness}%</div>
          <div class="conf-label">Data Completeness</div>
          <div class="conf-bar-wrap" style="width:140px"><div class="conf-bar-fill" style="width:${data.prediction.completeness}%;background:var(--accent-green)"></div></div>
        </div>
      </div>
    </div>`;
}

function renderKlementFactors(data) {
  const el = document.getElementById('klement-section');
  if (!el) return;
  const scoreRow = `
    <div class="score-total-grid" style="margin-bottom:20px">
      <div class="score-total-team a"><div class="score-total-label">${data.teamA.name}</div>
        <div class="score-total-value">${data.klementScore.a}</div><div class="score-total-sub">/ 6 pts</div></div>
      <div class="score-divider">•</div>
      <div class="score-total-team b"><div class="score-total-label">${data.teamB.name}</div>
        <div class="score-total-value">${data.klementScore.b}</div><div class="score-total-sub">/ 6 pts</div></div>
    </div>`;
  const cards = data.klementFactors.map((f, i) => {
    const wClass = f.winnerB ? 'winner-b' : f.winnerA ? 'winner-a' : f.missing ? 'missing' : 'neutral';
    const ptsA = f.winnerA ? '<span class="klement-pts won">+1</span>' : '<span class="klement-pts lost">+0</span>';
    const ptsB = f.winnerB ? '<span class="klement-pts won">+1</span>' : '<span class="klement-pts lost">+0</span>';
    const arrow = f.winnerA ? '←' : f.winnerB ? '→' : '=';
    return `
    <div class="klement-card ${wClass} delay-${(i%3)+1}" onclick="this.classList.toggle('expanded')">
      <div class="klement-name">${f.icon} ${f.name}</div>
      <div class="klement-scores">
        <div class="klement-score"><span class="klement-team">${data.teamA.name}</span>${ptsA}<span style="font-size:0.7rem;color:var(--text-muted)">${f.valA}</span></div>
        <div class="klement-arrow" style="color:var(--text-muted);font-size:1.2rem">${arrow}</div>
        <div class="klement-score"><span class="klement-team">${data.teamB.name}</span>${ptsB}<span style="font-size:0.7rem;color:var(--text-muted)">${f.valB}</span></div>
      </div>
      <div class="klement-expandable klement-detail">${f.detail}</div>
    </div>`;
  }).join('');
  el.innerHTML = scoreRow + `<div class="klement-grid">${cards}</div>
    <p style="font-size:0.72rem;color:var(--text-muted);margin-top:10px">💡 Klik setiap kartu untuk melihat alasan perhitungan.</p>`;
}

function renderTournamentStats(data) {
  const el = document.getElementById('stats-section');
  if (!el) return;
  const s = data.tournamentStats;

  if (!s || !s.a || !s.b) {
    el.innerHTML = `<div class="data-warning">⚠️ Data statistik turnamen belum tersedia.</div>`;
    return;
  }

  const formA = (s.a.form ?? []).map(r => `<span class="form-badge form-${r.toLowerCase()}">${r}</span>`).join('');
  const formB = (s.b.form ?? []).map(r => `<span class="form-badge form-${r.toLowerCase()}">${r}</span>`).join('');

  const rows = [
    { label: 'Form',          vA: `<div class="form-badges">${formA || '—'}</div>`, vB: `<div class="form-badges">${formB || '—'}</div>` },
    { label: 'W-D-L',         vA: `${s.a.w}-${s.a.d}-${s.a.l}`,  vB: `${s.b.w}-${s.b.d}-${s.b.l}` },
    { label: 'Goals For',     vA: s.a.gf,     vB: s.b.gf },
    { label: 'Goals Against', vA: s.a.ga,     vB: s.b.ga },
    { label: 'xG',            vA: s.a.xg,     vB: s.b.xg },
    { label: 'Shots',         vA: s.a.shots,  vB: s.b.shots },
    { label: 'Shots on Target', vA: s.a.sot,  vB: s.b.sot },
    { label: 'Possession %',  vA: `${s.a.possession}%`, vB: `${s.b.possession}%` },
    { label: 'Yellow Cards',  vA: `${s.a.ycards} 🟨`, vB: `${s.b.ycards} 🟨` },
    { label: 'Red Cards',     vA: s.a.rcards, vB: s.b.rcards },
  ];

  el.innerHTML = `<div class="stats-table">` + rows.map(r => `
    <div class="stats-row">
      <div class="stat-val-a">${r.vA}</div>
      <div class="stat-label">${r.label}</div>
      <div class="stat-val-b">${r.vB}</div>
    </div>`).join('') + `</div>`;
}

function renderPlayerRating(data) {
  const el = document.getElementById('rating-section');
  if (!el) return;
  const rd = data.ratingData;

  function liniBar(label, val, maxVal, cssClass) {
    const pct = Math.min((val / 10) * 100, 100);
    return `<div class="rating-bar-item">
      <div class="rating-bar-top"><span class="rating-bar-label">${label}</span><span class="rating-bar-value">${val}</span></div>
      <div class="rating-bar-track"><div class="rating-bar-fill ${cssClass}" style="width:${pct}%"></div></div>
    </div>`;
  }

  function teamBlock(t, cssLetter, cssClass) {
    const bars = [
      liniBar('Attack', t.attack, 10, cssClass),
      liniBar('Midfield', t.midfield, 10, cssClass),
      liniBar('Defense', t.defense, 10, cssClass),
      liniBar('Keeper', t.keeper, 10, cssClass),
      liniBar('Key Players', t.keyPlayers, 10, cssClass),
    ].join('');
    const playerCards = t.players.map(p => {
      const rc = getRatingClass(p.rating);
      return `<div class="player-card">
        <div class="player-number">${p.no}</div>
        <div class="player-info">
          <div class="player-name">${p.name}${p.key ? ' ⭐' : ''}</div>
          <div class="player-pos">${p.pos}</div>
        </div>
        <div class="player-rating-badge ${rc}">${p.rating}</div>
        <div class="player-status-icon">${getStatusIcon(p.status)}</div>
      </div>`;
    }).join('');
    return `<div class="rating-team-block">
      <div class="rating-team-name ${cssLetter}">${t.name} — Overall: ${t.overall}</div>
      ${bars}
      <div style="margin-top:16px">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px">Starting XI</div>
        <div class="player-list">${playerCards}</div>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div style="margin-bottom:16px" class="score-total-grid">
      <div class="score-total-team a"><div class="score-total-label">${rd.a.name}</div><div class="score-total-value">${data.ratingScore.a}</div><div class="score-total-sub">/ ${data.ratingScore.max} pts</div></div>
      <div class="score-divider">•</div>
      <div class="score-total-team b"><div class="score-total-label">${rd.b.name}</div><div class="score-total-value">${data.ratingScore.b}</div><div class="score-total-sub">/ ${data.ratingScore.max} pts</div></div>
    </div>
    <div class="tab-row">
      <button class="tab-btn active" onclick="switchTab(event,'tab-overview')">Overview</button>
      <button class="tab-btn" onclick="switchTab(event,'tab-squad-a')">${data.teamA.flag || ''} ${rd.a.name}</button>
      <button class="tab-btn" onclick="switchTab(event,'tab-squad-b')">${data.teamB.flag || ''} ${rd.b.name}</button>
    </div>
    <div id="tab-overview" class="tab-pane active">
      <div class="rating-grid">
        ${teamBlock(rd.a, 'a', 'fill-a')}
        ${teamBlock(rd.b, 'b', 'fill-b')}
      </div>
    </div>
    <div id="tab-squad-a" class="tab-pane">${teamBlock(rd.a, 'a', 'fill-a')}</div>
    <div id="tab-squad-b" class="tab-pane">${teamBlock(rd.b, 'b', 'fill-b')}</div>
    <div class="data-status-row mt-12">
      <span class="data-pill"><span class="dot dot-available"></span>Available</span>
      <span class="data-pill"><span class="dot dot-partial"></span>Rating from last 3 matches averaged</span>
    </div>`;
}

function switchTab(e, id) {
  const parent = e.target.closest('.panel-body') || e.target.closest('#rating-section');
  if (!parent) return;
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  parent.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  const pane = document.getElementById(id);
  if (pane) pane.classList.add('active');
}

function renderSquadCondition(data) {
  const el = document.getElementById('squad-section');
  if (!el) return;
  const sq = data.squadCondition;

  function teamBlock(t, teamName) {
    if (!t) return `<div class="squad-team-block"><div class="squad-team-header"><span class="squad-team-name">${teamName}</span></div><div style="color:var(--text-muted);font-size:0.78rem">Data belum tersedia.</div></div>`;
    const adj = t.totalAdj ?? 0;
    const adjClass = adj < 0 ? 'adj-neg' : 'adj-pos';
    const adjText  = adj < 0 ? `${adj.toFixed(2)}` : `+${adj.toFixed(2)}`;
    const items = (t.items ?? []).map(it => {
      const adjC  = it.adj < 0 ? 'adj-r' : 'adj-g';
      const adjStr = it.adj < 0 ? `${it.adj}` : `+${it.adj}`;
      return `<div class="condition-item">
        <span class="condition-icon">${it.icon}</span>
        <span>${it.text}</span>
        <span class="condition-adj ${adjC}">${adjStr}</span>
      </div>`;
    }).join('') || `<div style="color:var(--accent-green);font-size:0.78rem">✅ Skuad dalam kondisi baik.</div>`;
    return `<div class="squad-team-block">
      <div class="squad-team-header">
        <span class="squad-team-name">${teamName}</span>
        <span class="squad-adjustment ${adjClass}">Net: ${adjText}</span>
      </div>
      ${items}
    </div>`;
  }

  el.innerHTML = `
    <div class="score-total-grid" style="margin-bottom:20px">
      <div class="score-total-team a"><div class="score-total-label">${data.teamA.name}</div><div class="score-total-value">${data.squadScore.a}</div><div class="score-total-sub">/ ${data.squadScore.max} pts</div></div>
      <div class="score-divider">•</div>
      <div class="score-total-team b"><div class="score-total-label">${data.teamB.name}</div><div class="score-total-value">${data.squadScore.b}</div><div class="score-total-sub">/ ${data.squadScore.max} pts</div></div>
    </div>
    <div class="squad-grid">
      ${teamBlock(sq.a, data.teamA.name)}
      ${teamBlock(sq.b, data.teamB.name)}
    </div>`;
}

function renderGroupSituation(data) {
  const el = document.getElementById('group-section');
  if (!el) return;
  const gs = data.groupSituation;

  function block(g, teamColor) {
    if (!g) return `<div class="group-status-card" style="color:var(--text-muted)">Data grup belum tersedia.</div>`;
    const posClass = (g.position ?? 99) <= 2 ? 'pos-advance' : 'pos-danger';
    const posDisplay = g.position ?? '—';
    const ptsDisplay = g.pts ?? '—';
    return `<div class="group-status-card">
      <div class="group-team-name" style="color:${teamColor}">${g.team}</div>
      <div class="group-standing">
        <div class="position-badge ${posClass}">${posDisplay}</div>
        <span style="font-size:0.82rem;color:var(--text-secondary)"><strong>${ptsDisplay}</strong> pts in group</span>
      </div>
      <div class="group-motivation-label">Match Situation</div>
      <div class="group-motivation-value">${g.motivation ?? '—'}</div>
      <div class="group-impact">${typeof g.impact === 'string' ? g.impact : (g.impact?.description ?? '')}</div>
    </div>`;
  }

  el.innerHTML = `
    <div class="score-total-grid" style="margin-bottom:20px">
      <div class="score-total-team a"><div class="score-total-label">${data.teamA.name}</div><div class="score-total-value">${data.groupScore.a}</div><div class="score-total-sub">/ ${data.groupScore.max} pts</div></div>
      <div class="score-divider">•</div>
      <div class="score-total-team b"><div class="score-total-label">${data.teamB.name}</div><div class="score-total-value">${data.groupScore.b}</div><div class="score-total-sub">/ ${data.groupScore.max} pts</div></div>
    </div>
    <div class="group-grid">
      ${block(gs.a, 'var(--team-a)')}
      ${block(gs.b, 'var(--team-b)')}
    </div>`;
}

function renderFinalPrediction(data) {
  const el = document.getElementById('prediction-section');
  if (!el) return;
  const p = data.prediction;
  const cl = confidenceLabel(p.confidence);
  const [sA, sB] = p.score ? p.score.split('-') : ['-', '-'];

  const circumference = 2 * Math.PI * 42;
  const dashArr = ((p.confidence || 0) / 100) * circumference;

  const reasons = p.reasons.map(r => `
    <div class="reason-item">
      <div class="reason-bullet"></div>
      <span>${r}</span>
    </div>`).join('');

  const riskColor = p.risk === 'Low' ? 'var(--accent-green)' : p.risk === 'Medium' ? 'var(--accent-yellow)' : 'var(--accent-red)';

  el.innerHTML = `
    <div class="prediction-panel fade-up">
      <svg width="0" height="0" style="position:absolute">
        <defs>
          <linearGradient id="confGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:var(--accent-blue)"/>
            <stop offset="100%" style="stop-color:var(--accent-purple)"/>
          </linearGradient>
        </defs>
      </svg>
      <div class="prediction-title">⚡ Final Prediction Result</div>
      <div class="prediction-result-big">
        <div class="prediction-winner">${p.result}</div>
        <div style="margin-bottom:16px">
          <div class="predicted-score-display">
            <div style="text-align:center">
              <div class="score-team">${data.teamA.name}</div>
              <div class="score-num a">${sA}</div>
            </div>
            <div class="score-dash">—</div>
            <div style="text-align:center">
              <div class="score-team">${data.teamB.name}</div>
              <div class="score-num b">${sB}</div>
            </div>
          </div>
        </div>
        <div class="confidence-meter">
          <div class="confidence-circle-wrap">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle class="conf-track" cx="50" cy="50" r="42"/>
              <circle class="conf-fill" cx="50" cy="50" r="42"
                stroke-dasharray="${dashArr.toFixed(1)} ${circumference.toFixed(1)}"
                stroke-dashoffset="0"/>
            </svg>
            <div class="conf-number">
              <span class="conf-pct">${p.confidence}%</span>
              <span class="conf-sublabel">Confidence</span>
            </div>
          </div>
        </div>
      </div>

      <div class="prediction-meta-grid">
        <div class="pred-meta-item">
          <div class="pred-meta-label">Match Type</div>
          <div class="pred-meta-value">${p.matchType}</div>
        </div>
        <div class="pred-meta-item">
          <div class="pred-meta-label">Prediction Risk</div>
          <div class="pred-meta-value" style="color:${riskColor}">${p.risk}</div>
        </div>
        <div class="pred-meta-item">
          <div class="pred-meta-label">Data Completeness</div>
          <div class="pred-meta-value">${p.completeness}%</div>
        </div>
        <div class="pred-meta-item">
          <div class="pred-meta-label">Confidence Level</div>
          <div class="pred-meta-value"><span class="badge ${cl.badge}">${cl.text}</span></div>
        </div>
        <div class="pred-meta-item">
          <div class="pred-meta-label">Total Score A</div>
          <div class="pred-meta-value" style="color:var(--team-a)">${data.totalScore.a} / ${data.totalScore.max}</div>
        </div>
        <div class="pred-meta-item">
          <div class="pred-meta-label">Total Score B</div>
          <div class="pred-meta-value" style="color:var(--team-b)">${data.totalScore.b} / ${data.totalScore.max}</div>
        </div>
      </div>

      <div class="prediction-reasons">
        <div class="reasons-title">📌 Mengapa prediksi ini muncul?</div>
        ${reasons}
      </div>

      <div class="data-warning">
        ⚠️ <span>Prediksi ini adalah estimasi berbasis data, bukan jaminan hasil. Data status: <strong>${p.dataStatus}</strong>. Terakhir diperbarui: ${p.lastUpdate}</span>
      </div>
    </div>`;
}

// ---- Score Breakdown Section ----
function renderScoreBreakdown(data) {
  const el = document.getElementById('score-breakdown');
  if (!el) return;
  const rows = [
    { label: '6 Faktor Klement', a: data.klementScore.a, b: data.klementScore.b, max: 6 },
    { label: 'Statistik Turnamen', a: data.statsScore.a, b: data.statsScore.b, max: 3 },
    { label: 'Rating Pemain', a: data.ratingScore.a, b: data.ratingScore.b, max: 3 },
    { label: 'Kondisi Skuad', a: data.squadScore.a, b: data.squadScore.b, max: 2 },
    { label: 'Situasi Grup', a: data.groupScore.a, b: data.groupScore.b, max: 1 }
  ];
  el.innerHTML = rows.map(r => {
    const pctA = (r.a / r.max) * 100;
    const pctB = (r.b / r.max) * 100;
    return `
    <div class="stats-row">
      <div style="text-align:right">
        <span class="stat-val-a">${r.a}</span>
        <div class="stat-bar-wrap" style="margin-top:4px">
          <div class="stat-bar-a" style="width:${pctA}%"></div>
        </div>
      </div>
      <div class="stat-label" style="font-size:0.72rem">${r.label}<br><span style="color:var(--text-muted)">(max ${r.max})</span></div>
      <div>
        <span class="stat-val-b">${r.b}</span>
        <div class="stat-bar-wrap" style="margin-top:4px">
          <div class="stat-bar-b" style="width:${pctB}%;left:auto;right:0"></div>
        </div>
      </div>
    </div>`;
  }).join('') + `
    <div class="stats-row" style="border-top:2px solid var(--border-light);padding-top:14px">
      <div class="stat-val-a" style="font-size:1.2rem">${data.totalScore.a}</div>
      <div class="stat-label" style="font-weight:800;color:var(--text-primary)">TOTAL<br><span style="font-size:0.65rem;color:var(--text-muted)">/ ${data.totalScore.max}</span></div>
      <div class="stat-val-b" style="font-size:1.2rem">${data.totalScore.b}</div>
    </div>`;
}

/* ===================================================================
   LOADING / ERROR STATES
   =================================================================== */
function showLoading(containerId, msg = 'Memuat data...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="text-align:center;padding:48px 24px;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:12px;animation:pulse 1.2s infinite">⏳</div>
      <div style="font-size:0.9rem">${msg}</div>
    </div>`;
}

function showError(containerId, msg = 'Gagal memuat data.', retryFn = null) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="text-align:center;padding:48px 24px">
      <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
      <div style="font-size:0.88rem;color:var(--accent-yellow);margin-bottom:16px">${msg}</div>
      ${retryFn ? `<button class="btn btn-secondary btn-sm" onclick="(${retryFn})()">🔄 Coba Lagi</button>` : ''}
    </div>`;
}

function showOfflineBanner() {
  const existing = document.getElementById('offline-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = `
    position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;
    background:rgba(240,68,85,0.12);border:1px solid rgba(240,68,85,0.3);
    color:var(--accent-red);font-size:0.78rem;font-weight:600;
    padding:10px 20px;border-radius:20px;backdrop-filter:blur(8px);`;
  banner.innerHTML = '⚠️ Backend tidak merespon. Jalankan: <code>node server.js</code>';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

/* ===================================================================
   MATCHES PAGE — fetch & filter state
   =================================================================== */
let _allMatches = [];
let _currentFilter = 'all';
let _currentSearch = '';

async function loadMatches() {
  showLoading('matches-grid', 'Mengambil data pertandingan WC 2026...');

  try {
    _allMatches = await fetchMatches();

    // Lampirkan summary prediksi ke setiap match card (parallel, max 10 sekaligus)
    const chunks = chunkArray(_allMatches, 10);
    let summaryResults = [];
    for (const chunk of chunks) {
      const res = await Promise.allSettled(chunk.map(m => fetchPredictionSummary(m.id)));
      summaryResults = summaryResults.concat(res);
    }

    _allMatches = _allMatches.map((m, i) => {
      const s = summaryResults[i]?.status === 'fulfilled' ? summaryResults[i].value : null;
      return adaptMatchWithSummary(m, s);
    });

    applyMatchFilters();
  } catch (err) {
    console.error('loadMatches error:', err);
    if (!err.status) showOfflineBanner();
    const hint = err.type === 'PROVIDER_AUTH_FAILED'
      ? '<br>API key provider sedang ditolak. Cek status akun/key football-data.org.'
      : !err.status
      ? '<br>Pastikan backend berjalan di port 3001.'
      : '';
    showError('matches-grid', `Gagal memuat data: ${err.message}${hint}`);
  }
}

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function applyMatchFilters() {
  let filtered = [..._allMatches];
  if (_currentFilter !== 'all') {
    filtered = filtered.filter(m => m.status === _currentFilter);
  }
  if (_currentSearch) {
    const q = _currentSearch.toLowerCase();
    filtered = filtered.filter(m =>
      m.teamA.toLowerCase().includes(q) || m.teamB.toLowerCase().includes(q)
    );
  }

  const grid = document.getElementById('matches-grid');
  if (grid) {
    if (filtered.length === 0) {
      grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1">
        Tidak ada pertandingan yang cocok.</div>`;
    } else {
      renderMatchCards(filtered, 'matches-grid');
    }
  }

  // Live & upcoming section (hanya di home)
  const liveGrid = document.getElementById('live-grid');
  const upGrid   = document.getElementById('upcoming-grid');
  if (liveGrid) renderMatchCards(_allMatches.filter(m => m.status === 'live'), 'live-grid');
  if (upGrid)   renderMatchCards(_allMatches.filter(m => m.status === 'upcoming').slice(0, 3), 'upcoming-grid');
}

/* ===================================================================
   DETAIL PAGE — fetch full prediction
   =================================================================== */
async function loadDetailPage(matchId) {
  showLoading('match-header', 'Menghitung prediksi...');

  try {
    const raw     = await fetchPrediction(matchId);
    const adapted = adaptPredictionResponse(raw);

    updateDetailStaticLabels(adapted, matchId);
    renderDetailPage(adapted);
    renderKlementFactors(adapted);
    renderTournamentStats(adapted);
    renderPlayerRating(adapted);
    renderSquadCondition(adapted);
    renderGroupSituation(adapted);
    renderFinalPrediction(adapted);
    renderScoreBreakdown(adapted);

    // Breadcrumb
    const bc = document.getElementById('breadcrumb-match');
    if (bc) bc.textContent = `${adapted.teamA.name} vs ${adapted.teamB.name}`;

    // Title tab
    document.title = `${adapted.teamA.name} vs ${adapted.teamB.name} — WC2026 Predict`;

    // Sidebar data status
    updateSidebarDataStatus(adapted);

    // Last update
    const lastUpdateEl = document.getElementById('last-update-text');
    if (lastUpdateEl && adapted.prediction.lastUpdate) {
      lastUpdateEl.textContent = `Terakhir diperbarui: ${new Date(adapted.prediction.lastUpdate).toLocaleString('id-ID')}`;
    }

    initStepperObserver();

  } catch (err) {
    console.error('loadDetailPage error:', err);
    showError('match-header',
      `Gagal memuat prediksi: ${err.message}`,
      `() => loadDetailPage('${matchId}')`
    );
  }
}

function updateDetailStaticLabels(data, matchId) {
  setText('breadcrumb-match', `${data.teamA.name} vs ${data.teamB.name}`);
  setText('stats-team-a-label', teamLabel(data.teamA));
  setText('stats-team-b-label', teamLabel(data.teamB, true));
  setText('breakdown-team-a-label', teamLabel(data.teamA));
  setText('breakdown-team-b-label', teamLabel(data.teamB, true));
  setText('group-panel-title', `Situasi ${data.group || 'Grup'}`);

  const comparisonLink = document.getElementById('comparison-link');
  if (comparisonLink) comparisonLink.href = comparisonUrl(matchId || data.id);

  const squadWarning = document.getElementById('squad-warning');
  if (squadWarning) {
    const issues = [
      ...(data.squadCondition?.a?.items || []),
      ...(data.squadCondition?.b?.items || []),
    ];
    if (issues.length > 0) {
      squadWarning.style.display = '';
      squadWarning.innerHTML = `<span>${issues.length} catatan kondisi skuad terdeteksi dari data kartu/suspensi dan memengaruhi rating efektif.</span>`;
    } else {
      squadWarning.style.display = 'none';
      squadWarning.innerHTML = '';
    }
  }
}

function updateSidebarDataStatus(data) {
  const statusWrap = document.getElementById('sidebar-data-status');
  if (!statusWrap) return;

  const countAvailable = [
    data.klementFactors?.length > 0,
    data.tournamentStats?.a != null,
    data.ratingData?.a != null,
    data.squadCondition?.a != null,
    data.groupSituation?.a != null,
    data.prediction != null,
  ].filter(Boolean).length;

  const missing = data.klementFactors?.filter(f => f.missing || f.dataStatus === 'missing').length ?? 0;
  const partial = missing > 0 || (data.prediction?.completeness ?? 100) < 90 ? 1 : 0;

  statusWrap.innerHTML = `
    <span class="data-pill"><span class="dot dot-available"></span>${countAvailable} Available</span>
    ${partial ? `<span class="data-pill"><span class="dot dot-partial"></span>Partial</span>` : ''}
    ${missing ? `<span class="data-pill"><span class="dot dot-missing"></span>${missing} Missing</span>` : ''}`;
}

function initStepperObserver() {
  const sections = [
    'match-header','klement-panel','stats-panel','rating-panel',
    'squad-panel','group-panel','breakdown-panel','prediction-panel-wrap'
  ];
  const stepItems = document.querySelectorAll('.stepper-item[data-section]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        stepItems.forEach(s => {
          s.classList.toggle('active', s.dataset.section === e.target.id);
        });
      }
    });
  }, { threshold: 0.25 });
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

/* ===================================================================
   COMPARISON PAGE
   =================================================================== */
async function loadComparisonPage(matchId) {
  const compGrid = document.getElementById('rating-compare-section');
  if (!compGrid) return;

  try {
    const raw     = await fetchPrediction(matchId);
    const adapted = adaptPredictionResponse(raw);

    setText('comp-subtitle', `Analisis mendalam: ${adapted.teamA.name} vs ${adapted.teamB.name} - Piala Dunia 2026`);
    const nameA = document.getElementById('comp-name-a');
    const nameB = document.getElementById('comp-name-b');
    const flagA = document.getElementById('comp-flag-a');
    const flagB = document.getElementById('comp-flag-b');
    const rankA = document.getElementById('comp-rank-a');
    const rankB = document.getElementById('comp-rank-b');
    if (nameA) nameA.textContent = adapted.teamA.name;
    if (nameB) nameB.textContent = adapted.teamB.name;
    if (flagA) flagA.textContent = adapted.teamA.flag;
    if (flagB) flagB.textContent = adapted.teamB.flag;
    if (rankA) rankA.textContent = `FIFA #${adapted.teamA.rank} · ${adapted.group || ''}`;
    if (rankB) rankB.textContent = `FIFA #${adapted.teamB.rank} · ${adapted.group || ''}`;

    setText('comp-klement-head-a', teamLabel(adapted.teamA));
    setText('comp-klement-head-b', teamLabel(adapted.teamB, true));
    setText('comp-stats-head-a', teamLabel(adapted.teamA));
    setText('comp-stats-head-b', teamLabel(adapted.teamB, true));
    const detailLink = document.getElementById('comparison-detail-link');
    if (detailLink) detailLink.href = detailUrl(matchId || adapted.id);

    renderComparisonKlement(adapted);
    renderComparisonTournament(adapted);
    renderComparisonRatingBars(adapted, 'rating-compare-section');

  } catch (err) {
    console.error('loadComparisonPage error:', err);
    showError('rating-compare-section', `Gagal memuat: ${err.message}`);
  }
}

function renderComparisonKlement(adapted) {
  const body = document.getElementById('comp-klement-body');
  const foot = document.getElementById('comp-klement-foot');
  if (!body || !foot) return;

  body.innerHTML = (adapted.klementFactors || []).map((factor) => {
    const winner = factor.winnerA
      ? `<span class="badge badge-medium" style="background:rgba(77,143,255,0.12);color:var(--team-a)">${adapted.teamA.name} +1</span>`
      : factor.winnerB
      ? `<span class="badge badge-medium" style="background:rgba(124,92,252,0.12);color:var(--team-b)">${adapted.teamB.name} +1</span>`
      : `<span class="badge badge-finished">Netral</span>`;
    return `
      <tr>
        <td class="val-a" style="text-align:right">${factor.valA ?? '-'}</td>
        <td class="metric-name" style="text-align:center">${factor.name}</td>
        <td class="val-b">${factor.valB ?? '-'}</td>
        <td style="text-align:center">${winner}</td>
      </tr>`;
  }).join('');

  foot.innerHTML = `
    <tr style="background:var(--bg-secondary)">
      <td style="text-align:right;font-size:1.2rem;font-weight:800;color:var(--team-a)">${adapted.klementScore.a}</td>
      <td style="text-align:center;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted)">Total Score</td>
      <td style="font-size:1.2rem;font-weight:800;color:var(--team-b)">${adapted.klementScore.b}</td>
      <td style="text-align:center"><span style="font-size:0.8rem;color:var(--text-muted)">/ 6 pts</span></td>
    </tr>`;
}

function renderFormBadges(form, alignEnd = false) {
  const items = (form || []).map((r) => `<span class="form-badge form-${String(r).toLowerCase()}">${r}</span>`).join('');
  return `<div class="form-badges" style="${alignEnd ? 'justify-content:flex-end;display:flex' : ''}">${items || '-'}</div>`;
}

function renderComparisonTournament(adapted) {
  const body = document.getElementById('comp-stats-body');
  if (!body) return;
  const a = adapted.tournamentStats?.a || {};
  const b = adapted.tournamentStats?.b || {};
  const rows = [
    { label: 'Form', a: renderFormBadges(a.form, true), b: renderFormBadges(b.form) },
    { label: 'W-D-L', a: `${a.w ?? 0}-${a.d ?? 0}-${a.l ?? 0}`, b: `${b.w ?? 0}-${b.d ?? 0}-${b.l ?? 0}` },
    { label: 'Gol Dicetak', a: formatNum(a.gf), b: formatNum(b.gf) },
    { label: 'Gol Kebobolan', a: formatNum(a.ga), b: formatNum(b.ga) },
    { label: 'xG', a: formatNum(a.xg), b: formatNum(b.xg) },
    { label: 'Total Shots', a: formatNum(a.shots), b: formatNum(b.shots) },
    { label: 'Shots on Target', a: formatNum(a.sot), b: formatNum(b.sot) },
    { label: 'Possession', a: formatNum(a.possession, '%'), b: formatNum(b.possession, '%') },
    { label: 'Yellow Cards', a: formatNum(a.ycards), b: formatNum(b.ycards) },
    { label: 'Red Cards', a: formatNum(a.rcards), b: formatNum(b.rcards) },
  ];

  body.innerHTML = rows.map((row) => `
    <tr>
      <td class="val-a" style="text-align:right">${row.a}</td>
      <td class="metric-name" style="text-align:center">${row.label}</td>
      <td class="val-b">${row.b}</td>
    </tr>`).join('');
}

function renderComparisonRatingBars(adapted, containerId) {
  const el = document.getElementById(containerId);
  if (!el || !adapted.ratingData) return;
  const rd = adapted.ratingData;
  const metrics = [
    { label: 'Overall Rating', a: rd.a?.overall, b: rd.b?.overall },
    { label: 'Attack Strength', a: rd.a?.attack, b: rd.b?.attack },
    { label: 'Midfield Quality', a: rd.a?.midfield, b: rd.b?.midfield },
    { label: 'Defense Stability', a: rd.a?.defense, b: rd.b?.defense },
    { label: 'Goalkeeper', a: rd.a?.keeper, b: rd.b?.keeper },
    { label: 'Key Players', a: rd.a?.keyPlayers, b: rd.b?.keyPlayers },
  ];
  el.innerHTML = metrics.map(m => {
    if (m.a == null || m.b == null) return '';
    const pctA = (m.a / 10) * 100;
    const pctB = (m.b / 10) * 100;
    const winA = m.a > m.b;
    const winB = m.b > m.a;
    return `
    <div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-weight:700;color:${winA ? 'var(--team-a)' : 'var(--text-secondary)'};font-size:0.88rem">${m.a} ${winA ? '✓' : ''}</span>
        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600">${m.label}</span>
        <span style="font-weight:700;color:${winB ? 'var(--team-b)' : 'var(--text-secondary)'};font-size:0.88rem">${winB ? '✓' : ''} ${m.b}</span>
      </div>
      <div style="position:relative;height:10px;display:flex;border-radius:6px;overflow:hidden;background:var(--border)">
        <div style="width:${pctA}%;background:var(--team-a);border-radius:6px 0 0 6px;transition:width 1s"></div>
        <div style="width:2px;background:var(--bg-primary)"></div>
        <div style="width:${pctB}%;background:var(--team-b);border-radius:0 6px 6px 0;transition:width 1s"></div>
      </div>
    </div>`;
  }).join('');
}

/* ===================================================================
   INIT — entry point utama
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  /* ---------- HOME & MATCHES ---------- */
  if (page === 'home' || page === 'matches') {
    loadMatches();

    // Filter buttons
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _currentFilter = btn.dataset.filter;
        applyMatchFilters();
      });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        _currentSearch = searchInput.value;
        applyMatchFilters();
      });
    }
  }

  /* ---------- DETAIL ---------- */
  if (page === 'detail') {
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('id');
    if (matchId) {
      loadDetailPage(matchId);
    } else {
      fetchMatches()
        .then(matches => {
          const fallback = matches.find(m => m.status === 'upcoming') || matches[0];
          if (!fallback) throw new Error('Tidak ada pertandingan tersedia.');
          return loadDetailPage(fallback.id);
        })
        .catch(err => showError('match-header', `Gagal memuat pertandingan: ${err.message}`));
    }
  }

  /* ---------- COMPARISON ---------- */
  if (page === 'comparison') {
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('id');
    if (matchId) {
      loadComparisonPage(matchId);
    } else {
      fetchMatches()
        .then(matches => {
          const fallback = matches.find(m => m.status === 'upcoming') || matches[0];
          if (!fallback) throw new Error('Tidak ada pertandingan tersedia.');
          return loadComparisonPage(fallback.id);
        })
        .catch(err => showError('rating-compare-section', `Gagal memuat pertandingan: ${err.message}`));
    }
  }
});
