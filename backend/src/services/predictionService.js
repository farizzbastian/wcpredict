'use strict';

const fd = require('./footballDataService');
const { calculateKlementFactors }  = require('../engine/klementEngine');
const { calculateTeamRating, compareRatings } = require('../engine/playerRatingEngine');
const { calculateTournamentScore } = require('../engine/tournamentStatsEngine');
const { analyzeGroupSituation }    = require('../engine/groupSituationEngine');
const { calculateMatchPrediction } = require('../engine/klementScoring');
const { applyManualPredictionOverrides } = require('./manualDataService');

/**
 * Jalankan prediksi lengkap untuk satu match.
 * Semua data diambil dari football-data.org (real WC 2026).
 */
async function getPrediction(match) {
  const tlaA = match.tlaA;
  const tlaB = match.tlaB;

  // ---- Ambil data tim ----
  const teamDataA = fd.getTeamData(tlaA);
  const teamDataB = fd.getTeamData(tlaB);

  // Bentuk object yang dipakai engine
  const teamA = { name: match.teamA, flag: match.flagA, ...teamDataA };
  const teamB = { name: match.teamB, flag: match.flagB, ...teamDataB };

  // ---- Ambil standings & stats ----
  const standings = await fd.getStandings();
  const groupName = match.group;

  const rowA = findStandingRow(standings, groupName, tlaA);
  const rowB = findStandingRow(standings, groupName, tlaB);

  const statsA = rowA?.stats || null;
  const statsB = rowB?.stats || null;

  // ---- Engines ----
  const klementResult    = calculateKlementFactors(teamA, teamB, statsA, statsB);
  const tournamentResult = calculateTournamentScore(statsA, statsB);

  // Player rating — gunakan estimasi dari FIFA rank jika tidak ada data pemain detail
  const ratingResultA = deriveTournamentRating(tlaA, teamDataA, match.teamA, statsA);
  const ratingResultB = deriveTournamentRating(tlaB, teamDataB, match.teamB, statsB);
  const ratingScore   = compareRatings(ratingResultA, ratingResultB);

  // Group situation — pakai data standings real
  const groupSituation = buildGroupSituation(
    match.teamA, match.teamB, rowA, rowB, match.status
  );

  // ---- Prediksi final: format baru 100 poin berdasarkan 6 Faktor Klement lengkap ----
  const scoringInput = buildScoringInput({
    match,
    teamA,
    teamB,
    statsA,
    statsB,
    ratingResultA,
    ratingResultB,
  });
  const scoringInputWithManual = applyManualPredictionOverrides({
    match: scoringInput.match,
    teamAData: scoringInput.teamAData,
    teamBData: scoringInput.teamBData,
    tlaA,
    tlaB,
  });
  const fullPrediction = calculateMatchPrediction(scoringInputWithManual);
  const prediction = adaptFullPredictionForApi(fullPrediction, teamA, teamB);
  const disciplineRow = fullPrediction.breakdown.find((row) => row.id === 'disciplineAvailability') || {};
  const injuryRow = fullPrediction.breakdown.find((row) => row.id === 'injuryAvailability') || {};
  const squadScoreA = Number(((disciplineRow.teamAScore || 0) + (injuryRow.teamAScore || 0)).toFixed(1));
  const squadScoreB = Number(((disciplineRow.teamBScore || 0) + (injuryRow.teamBScore || 0)).toFixed(1));

  return {
    match: {
      id: match.id,
      teamA: { name: teamA.name, flag: teamA.flag, rank: teamA.fifaRank, gdp: teamA.gdpPerCapita, avgTemp: teamA.avgTemperature, isHost: teamA.isHost, crest: match.crestA },
      teamB: { name: teamB.name, flag: teamB.flag, rank: teamB.fifaRank, gdp: teamB.gdpPerCapita, avgTemp: teamB.avgTemperature, isHost: teamB.isHost, crest: match.crestB },
      date: match.date, time: match.time,
      stadium: match.stadium, city: match.city,
      phase: match.phase, group: match.group,
      status: match.status, liveScore: match.liveScore,
    },
    klementFactors: {
      scoreA: fullPrediction.totalScore.teamA,
      scoreB: fullPrediction.totalScore.teamB,
      maxScore: fullPrediction.maxTotal,
      factors: fullPrediction.breakdown.map((row) => adaptBreakdownRowToFactor(row, teamA.name, teamB.name)),
    },
    tournamentStats: {
      scoreA: tournamentResult.scoreA,
      scoreB: tournamentResult.scoreB,
      maxScore: tournamentResult.maxScore,
      dataStatus: tournamentResult.dataStatus,
      components: tournamentResult.components || [],
      profiles: tournamentResult.profiles || null,
      statsA, statsB,
    },
    playerRating: {
      scoreA: ratingScore.scoreA,
      scoreB: ratingScore.scoreB,
      maxScore: ratingScore.maxScore,
      components: ratingScore.components || [],
      teamA: ratingResultA,
      teamB: ratingResultB,
    },
    squadCondition: {
      teamA: { conditions: ratingResultA.conditions, totalAdjustment: ratingResultA.totalAdjustment },
      teamB: { conditions: ratingResultB.conditions, totalAdjustment: ratingResultB.totalAdjustment },
      scoreA: squadScoreA,
      scoreB: squadScoreB,
      maxScore: 10,
    },
    groupSituation,
    prediction,
  };
}

function findStandingRow(standings, groupName, tla) {
  if (!tla) return null;

  const directGroupRows = groupName ? (standings[groupName] || []) : [];
  const direct = directGroupRows.find((row) => row.tla === tla);
  if (direct) return direct;

  for (const rows of Object.values(standings)) {
    const found = rows.find((row) => row.tla === tla);
    if (found) return found;
  }

  return null;
}

function buildScoringInput({ match, teamA, teamB, statsA, statsB, ratingResultA, ratingResultB }) {
  return {
    match: {
      id: match.id,
      teamA: teamA.name,
      teamB: teamB.name,
      tournament: 'World Cup 2026',
      stage: match.phase,
      matchDate: match.date,
      venue: match.stadium,
      venueCountry: match.venueCountry || null,
      hostCountries: ['United States', 'Mexico', 'Canada'],
    },
    teamAData: buildTeamScoringData(teamA, statsA, ratingResultA),
    teamBData: buildTeamScoringData(teamB, statsB, ratingResultB),
  };
}

function buildTeamScoringData(team, stats, rating) {
  return {
    country: team.name,
    fifaRank: team.fifaRank ?? null,
    gdpPerCapita: team.gdpPerCapita ?? null,
    population: team.population ?? null,
    footballCultureScore: team.footballCultureScore ?? null,
    averageTemperature: team.avgTemperature ?? team.averageTemperature ?? null,
    isHost: Boolean(team.isHost),
    tournamentStats: {
      matchesPlayed: stats?.matchesPlayed ?? null,
      wins: stats?.wins ?? null,
      draws: stats?.draws ?? null,
      losses: stats?.losses ?? null,
      goalsFor: stats?.goalsFor ?? null,
      goalsAgainst: stats?.goalsAgainst ?? null,
      goalDifference: stats?.goalDiff ?? stats?.goalDifference ?? null,
      xG: stats?.xg ?? null,
      shots: stats?.shots ?? null,
      shotsOnTarget: stats?.shotsOnTarget ?? null,
      possession: stats?.possessionAvg ?? stats?.possession ?? null,
      cleanSheets: stats?.cleanSheets ?? null,
      yellowCards: stats?.yellowCards ?? 0,
      redCards: stats?.redCards ?? 0,
      accumulatedCardRisk: stats?.accumulatedCardRisk ?? 0,
    },
    squadStatus: deriveSquadStatusFromRating(rating),
    playerRatings: {
      averageRating: rating?.adjustedOverall ?? null,
      keyPlayers: rating?.raw?.keyPlayers != null ? [{ rating: rating.raw.keyPlayers, importance: 'key' }] : [],
    },
    mentalProfile: {
      knockoutExperience: null,
      comebackRecord: null,
      lateGoals: null,
      penaltyRecord: null,
      seniorLeadership: null,
      responseAfterConceding: null,
      tournamentHistory: null,
      recentMomentum: null,
    },
  };
}

function deriveSquadStatusFromRating(rating) {
  const status = {
    injuredPlayers: [],
    doubtfulPlayers: [],
    suspendedPlayers: [],
    unavailablePlayers: [],
  };

  (rating?.conditions || []).forEach((condition) => {
    const player = {
      name: condition.text,
      importance: condition.isKeyPlayer ? 'key' : 'rotation',
    };
    if (condition.type === 'suspension') status.suspendedPlayers.push(player);
    if (condition.type === 'injury') status.injuredPlayers.push(player);
  });

  return status;
}

function adaptFullPredictionForApi(fullPrediction, teamA, teamB) {
  const winnerName = fullPrediction.prediction.winner;
  const winner = winnerName === teamA.name ? teamA : winnerName === teamB.name ? teamB : null;
  const scoreDifference = Math.abs(fullPrediction.totalScore.teamA - fullPrediction.totalScore.teamB);
  const dataCompleteness = Math.round(
    ((fullPrediction.breakdown.length - fullPrediction.dataQuality.unavailableFactors.length) / fullPrediction.breakdown.length) * 100
  );
  const risk = fullPrediction.prediction.status === 'Strong favorite'
    ? 'Low'
    : fullPrediction.prediction.status === 'Slight favorite'
      ? 'Medium'
      : 'High';

  return {
    totalA: fullPrediction.totalScore.teamA,
    totalB: fullPrediction.totalScore.teamB,
    maxTotal: fullPrediction.maxTotal,
    winner,
    winnerName,
    resultType: fullPrediction.prediction.isCloseMatch ? 'close_match' : winner ? 'win' : 'draw',
    resultLabel: winner
      ? `${winner.name} ${scoreDifference <= 7 ? 'Menang Tipis' : 'Menang'}`
      : 'Pertandingan Seimbang',
    predictedScore: fullPrediction.prediction.predictedScore,
    confidence: fullPrediction.prediction.confidence,
    completeness: dataCompleteness,
    risk,
    status: fullPrediction.prediction.status,
    isCloseMatch: fullPrediction.prediction.isCloseMatch,
    extraTimeRisk: fullPrediction.prediction.extraTimeRisk,
    penaltyRisk: fullPrediction.prediction.penaltyRisk,
    dataStatus: fullPrediction.dataQuality.unavailableFactors.length ? 'partial' : 'complete',
    predictionReady: true,
    formulaVersion: 'klement-100-v1',
    reasons: fullPrediction.keyReasons,
    riskNotes: fullPrediction.riskNotes,
    breakdown: fullPrediction.breakdown,
    dataQuality: fullPrediction.dataQuality,
    full: fullPrediction,
    lastUpdated: fullPrediction.dataQuality.lastUpdated,
  };
}

function adaptBreakdownRowToFactor(row, teamAName, teamBName) {
  return {
    id: row.id,
    name: row.factor,
    icon: '',
    dataStatus: row.dataStatus,
    missing: row.dataStatus === 'missing',
    winnerA: row.winner === teamAName,
    winnerB: row.winner === teamBName,
    neutral: row.winner === 'Neutral',
    scoreA: row.teamAScore,
    scoreB: row.teamBScore,
    maxScore: row.maxScore,
    valA: `${row.teamAScore}/${row.maxScore}`,
    valB: `${row.teamBScore}/${row.maxScore}`,
    unit: 'poin',
    detail: row.explanation,
  };
}

/**
 * Estimasi rating tim dari FIFA rank & performa turnamen
 * (digunakan saat data pemain detail tidak tersedia)
 */
function deriveTournamentRating(tla, teamData, teamName, stats) {
  const rank = teamData?.fifaRank || 50;
  const r = (v) => +v.toFixed(2);
  const mp = Math.max(stats?.matchesPlayed || 0, 1);
  const ppg = ((stats?.wins || 0) * 3 + (stats?.draws || 0)) / mp;
  const gfPerMatch = (stats?.goalsFor || 0) / mp;
  const gaPerMatch = (stats?.goalsAgainst || 0) / mp;
  const xgPerMatch = (stats?.xg || 0) / mp;
  const sotPerMatch = (stats?.shotsOnTarget || 0) / mp;
  const possession = stats?.possessionAvg ?? 50;
  const disciplinePenalty = ((stats?.yellowCards || 0) * 0.03) + ((stats?.redCards || 0) * 0.18) + ((stats?.suspensions || 0) * 0.25);
  const rankBase = Math.max(5.5, 8.8 - (rank - 1) * 0.025);
  const formBoost = (ppg - 1.25) * 0.28 + (gfPerMatch - gaPerMatch) * 0.18 + (xgPerMatch - 1.15) * 0.2;
  const base = clamp(rankBase + formBoost - disciplinePenalty, 5.2, 9.4);
  const raw = {
    overall:    r(base),
    keeper:     r(clamp(base + (1.15 - gaPerMatch) * 0.28, 5.0, 9.5)),
    defense:    r(clamp(base + (1.05 - gaPerMatch) * 0.24 - (stats?.redCards || 0) * 0.08, 5.0, 9.5)),
    midfield:   r(clamp(base + (possession - 50) * 0.025, 5.0, 9.5)),
    attack:     r(clamp(base + (xgPerMatch - 1.2) * 0.3 + (sotPerMatch - 3.5) * 0.08, 5.0, 9.5)),
    keyPlayers: r(clamp(base + (ppg - 1.4) * 0.18 + (gfPerMatch * 0.08), 5.0, 9.6)),
  };

  const conditions = [];
  let totalAdjustment = 0;
  if ((stats?.suspensions || 0) > 0) {
    const adjustment = -Math.min(0.9, stats.suspensions * 0.25);
    conditions.push({
      type: 'suspension',
      icon: '🟨',
      text: `${teamName} memiliki ${stats.suspensions} risiko suspensi dari akumulasi kartu turnamen`,
      adjustment,
      isKeyPlayer: false,
    });
    totalAdjustment += adjustment;
  }
  if (((stats?.yellowCards || 0) / mp) >= 2.5) {
    conditions.push({
      type: 'discipline',
      icon: '🟨',
      text: `${teamName} rata-rata kartu kuning tinggi (${r((stats.yellowCards || 0) / mp)} per laga)`,
      adjustment: -0.15,
      isKeyPlayer: false,
    });
    totalAdjustment -= 0.15;
  }

  return {
    teamName,
    raw,
    adjustedOverall: r(clamp(raw.overall + totalAdjustment, 5.0, 9.5)),
    totalAdjustment: r(totalAdjustment),
    conditions,
    players: buildDerivedLinePlayers(teamName, raw),
    dataStatus: stats?.dataStatus === 'derived' ? 'derived' : 'estimated',
    source: 'wc2026_team_average_derived',
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildDerivedLinePlayers(teamName, raw) {
  const make = (no, suffix, position, rating, key = false) => ({
    no,
    name: `${teamName} ${suffix}`,
    position,
    isStartingXI: true,
    isKeyPlayer: key,
    averageRating: rating,
    injuryStatus: 'unknown',
    suspensionStatus: 'none',
    rotationRisk: 0.1,
  });
  return [
    make(1, 'GK Avg', 'GK', raw.keeper, true),
    make(2, 'DEF Avg 1', 'DEF', raw.defense, true),
    make(3, 'DEF Avg 2', 'DEF', raw.defense),
    make(4, 'DEF Avg 3', 'DEF', raw.defense),
    make(5, 'DEF Avg 4', 'DEF', raw.defense),
    make(6, 'MID Avg 1', 'MID', raw.midfield, true),
    make(7, 'MID Avg 2', 'MID', raw.midfield),
    make(8, 'MID Avg 3', 'MID', raw.midfield),
    make(9, 'FWD Avg 1', 'FWD', raw.attack, true),
    make(10, 'FWD Avg 2', 'FWD', raw.attack),
    make(11, 'FWD Avg 3', 'FWD', raw.attack),
  ];
}

/**
 * Bangun group situation dari standings real
 */
function buildGroupSituation(teamNameA, teamNameB, rowA, rowB, matchStatus) {
  const toSide = (row, teamName) => {
    if (!row) return {
      team: teamName, position: null, pts: null,
      status: 'normal', motivation: 'Data belum tersedia',
      impact: { description: 'Standings belum tersedia.', rotationRisk: false, attackBoost: false },
      dataStatus: 'missing',
    };
    const status = row.status;
    const motivationMap = {
      must_win:          'Wajib Menang',
      draw_enough:       'Cukup Imbang',
      already_qualified: 'Sudah Lolos',
      already_eliminated:'Sudah Gugur',
      normal:            'Normal',
    };
    const impactMap = {
      must_win:          { description:'Tim cenderung menyerang agresif. Risiko kebobolan naik.', attackBoost:true,  rotationRisk:false, confidenceMod:0 },
      draw_enough:       { description:'Tim bermain aman, menjaga hasil imbang. Tempo lebih rendah.', attackBoost:false, rotationRisk:false, confidenceMod:0 },
      already_qualified: { description:'Tim mungkin merotasi pemain kunci.', attackBoost:false, rotationRisk:true, confidenceMod:-5 },
      already_eliminated:{ description:'Motivasi bisa turun, tetapi bisa bermain bebas.', attackBoost:false, rotationRisk:true, confidenceMod:-8 },
      normal:            { description:'Situasi normal, kedua tim berjuang penuh.', attackBoost:false, rotationRisk:false, confidenceMod:0 },
    };
    return {
      team: teamName, position: row.position, pts: row.pts,
      won: row.won, drawn: row.drawn, lost: row.lost,
      gf: row.gf, ga: row.ga,
      status, motivation: motivationMap[status] || status,
      impact: impactMap[status] || impactMap.normal,
      dataStatus: 'available',
    };
  };

  const sideA = toSide(rowA, teamNameA);
  const sideB = toSide(rowB, teamNameB);

  const mScore = { must_win:2, draw_enough:1, already_qualified:0.5, already_eliminated:0, normal:1 };
  const mA = mScore[sideA.status] ?? 1;
  const mB = mScore[sideB.status] ?? 1;

  // Jika pertandingan sudah selesai / bukan grup, netral
  if (matchStatus === 'finished' || !rowA) {
    return { sideA, sideB, scoreA:0, scoreB:0, maxScore:1, dataStatus:'available' };
  }

  return {
    sideA, sideB,
    scoreA: mA > mB ? 1 : 0,
    scoreB: mB > mA ? 1 : 0,
    maxScore: 1,
    dataStatus: rowA ? 'available' : 'missing',
  };
}

module.exports = { getPrediction };
