/* ===== API.JS — Backend integration layer ===== */
/* Semua fetch ke backend melewati file ini.         */
/* Jika backend offline, fallback ke data.js lokal. */

const API_BASE = (() => {
  const override = new URLSearchParams(window.location.search).get('api');
  if (override) return override.replace(/\/$/, '');
  return `${window.location.origin}/api`;
})();

/* ---- Utilitas fetch dengan fallback ---- */
async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err?.error?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.type = err?.error?.type;
    error.dataStatus = err?.error?.dataStatus;
    throw error;
  }
  return res.json();
}

/* ============================
   MATCH API
   ============================ */

async function fetchMatches(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v && v !== 'all')
  ).toString();
  const { data } = await apiFetch(`/matches${qs ? '?' + qs : ''}`);
  return data;
}

async function fetchMatchById(id) {
  const { data } = await apiFetch(`/matches/${id}`);
  return data;
}

/* ============================
   PREDICTION API
   ============================ */

async function fetchPrediction(matchId) {
  const json = await apiFetch(`/predictions/${matchId}`);
  return json.data;   // { match, klementFactors, tournamentStats, playerRating, squadCondition, groupSituation, prediction }
}

async function fetchPredictionSummary(matchId) {
  const { data } = await apiFetch(`/predictions/${matchId}/summary`);
  return data;
}

/* ============================
   TEAMS API
   ============================ */

async function fetchTeams() {
  const { data } = await apiFetch('/teams');
  return data;
}

async function fetchTeamDetail(name) {
  const { data } = await apiFetch(`/teams/${encodeURIComponent(name)}`);
  return data;
}

/* ============================
   HEALTH CHECK
   ============================ */

async function checkBackendHealth() {
  try {
    const json = await apiFetch('/health');
    return json.success === true;
  } catch {
    return false;
  }
}

/**
 * Dari response GET /api/predictions/:id
 * → format yang dipakai renderMatchCards (perlu prediction summary di card)
 */
function adaptMatchWithSummary(match, summary) {
  return {
    ...match,
    confidence: summary?.confidence ?? null,
    prediction: summary?.resultLabel ?? null,
    predictedScore: summary?.predictedScore ?? null,
  };
}

/**
 * Dari response GET /api/predictions/:matchId
 * → format yang dipakai semua render functions di detail page
 */
function adaptPredictionResponse(apiData) {
  const { match, klementFactors, tournamentStats, playerRating, squadCondition, groupSituation, prediction } = apiData;

  return {
    // Match info
    id:      match.id,
    date:    match.date,
    time:    match.time,
    stadium: match.stadium,
    city:    match.city,
    phase:   match.phase,
    group:   match.group,
    status:  match.status,
    liveScore: match.liveScore,

    // Tim
    teamA: {
      name:    match.teamA.name,
      flag:    match.teamA.flag,
      rank:    match.teamA.rank,
      gdp:     match.teamA.gdp,
      avgTemp: match.teamA.avgTemp,
      isHost:  match.teamA.isHost,
    },
    teamB: {
      name:    match.teamB.name,
      flag:    match.teamB.flag,
      rank:    match.teamB.rank,
      gdp:     match.teamB.gdp,
      avgTemp: match.teamB.avgTemp,
      isHost:  match.teamB.isHost,
    },

    // Klement
    klementFactors: klementFactors.factors,
    klementScore:   { a: klementFactors.scoreA, b: klementFactors.scoreB, max: klementFactors.maxScore },

    // Stats turnamen
    tournamentStats: {
      a: adaptStats(tournamentStats.statsA),
      b: adaptStats(tournamentStats.statsB),
    },
    statsScore: { a: tournamentStats.scoreA, b: tournamentStats.scoreB, max: tournamentStats.maxScore },

    // Rating pemain
    ratingData: {
      a: adaptRatingTeam(playerRating.teamA, match.teamA.name),
      b: adaptRatingTeam(playerRating.teamB, match.teamB.name),
    },
    ratingScore: { a: playerRating.scoreA, b: playerRating.scoreB, max: playerRating.maxScore },

    // Kondisi skuad
    squadCondition: {
      a: adaptSquad(squadCondition.teamA),
      b: adaptSquad(squadCondition.teamB),
    },
    squadScore: { a: squadCondition.scoreA, b: squadCondition.scoreB, max: squadCondition.maxScore },

    // Situasi grup
    groupSituation: {
      a: adaptGroupSide(groupSituation.sideA),
      b: adaptGroupSide(groupSituation.sideB),
    },
    groupScore: { a: groupSituation.scoreA, b: groupSituation.scoreB, max: groupSituation.maxScore },

    // Total skor
    totalScore: { a: prediction.totalA, b: prediction.totalB, max: prediction.maxTotal },

    // Prediksi final
    prediction: {
      winner:       prediction.winner?.name ?? null,
      result:       prediction.resultLabel,
      score:        prediction.predictedScore,
      confidence:   prediction.confidence,
      completeness: prediction.completeness,
      risk:         prediction.risk,
      status:       prediction.status,
      isCloseMatch: prediction.isCloseMatch,
      extraTimeRisk: prediction.extraTimeRisk,
      penaltyRisk:  prediction.penaltyRisk,
      matchType:    capitalizeFirst(prediction.resultType?.replace('_', ' ') ?? ''),
      dataStatus:   prediction.dataStatus,
      lastUpdate:   prediction.lastUpdated,
      reasons:      prediction.reasons ?? [],
      riskNotes:    prediction.riskNotes ?? [],
      dataQuality:   prediction.dataQuality ?? null,
    },

    // Breakdown
    breakdown: Array.isArray(prediction.breakdown) ? prediction.breakdown : [],
  };
}

/* ---- sub-adapters ---- */

function adaptStats(s) {
  if (!s) return null;
  return {
    played: s.matchesPlayed, w: s.wins, d: s.draws, l: s.losses,
    gf: s.goalsFor, ga: s.goalsAgainst,
    xg: s.xg, shots: s.shots, sot: s.shotsOnTarget,
    possession: s.possessionAvg,
    ycards: s.yellowCards, rcards: s.redCards,
    form: s.form ?? [],
  };
}

function adaptRatingTeam(t, fallbackName) {
  if (!t) return null;
  return {
    name:       fallbackName,
    overall:    t.adjustedOverall ?? (t.raw?.overall ? +t.raw.overall.toFixed(2) : 0),
    attack:     t.raw?.attack    ? +t.raw.attack.toFixed(2)    : 0,
    midfield:   t.raw?.midfield  ? +t.raw.midfield.toFixed(2)  : 0,
    defense:    t.raw?.defense   ? +t.raw.defense.toFixed(2)   : 0,
    keeper:     t.raw?.keeper    ? +t.raw.keeper.toFixed(2)    : 0,
    keyPlayers: t.raw?.keyPlayers ? +t.raw.keyPlayers.toFixed(2) : 0,
    players: (t.players ?? []).filter(p => p.isStartingXI).map(p => ({
      no:     p.no,
      name:   p.name,
      pos:    p.position,
      rating: p.averageRating,
      key:    p.isKeyPlayer,
      status: adaptPlayerStatus(p),
    })),
  };
}

function adaptPlayerStatus(p) {
  if (p.suspensionStatus === 'suspended') return 'suspended';
  if (p.injuryStatus === 'injured') return 'injured';
  if (p.rotationRisk >= 0.3) return 'rotation';
  return 'fit';
}

function adaptSquad(sq) {
  if (!sq) return { items: [], totalAdj: 0 };
  return {
    items: (sq.conditions ?? []).map(c => ({
      type: c.type,
      icon: c.icon,
      text: c.text,
      adj:  c.adjustment,
    })),
    totalAdj: sq.totalAdjustment ?? 0,
  };
}

function adaptGroupSide(side) {
  if (!side) return null;
  return {
    team:       side.team,
    position:   side.position,
    pts:        side.pts,
    status:     side.status,
    motivation: side.motivation,
    impact:     side.impact?.description ?? '',
  };
}

function capitalizeFirst(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
