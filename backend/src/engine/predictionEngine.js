'use strict';

/**
 * Prediction Engine — inti utama sistem
 * Menggabungkan semua skor dari:
 *   1. 6 Faktor Klement      (max 6)
 *   2. Statistik Turnamen    (max 3)
 *   3. Rating Pemain         (max 3)
 *   4. Kondisi Skuad         (max 2)
 *   5. Situasi Grup          (max 1)
 *   Total max: 15
 *
 * Sesuai PRD Seksi 16-20.
 */

/**
 * Hitung skor kondisi skuad (0-2) berdasarkan adjustment dari rating engine
 * Tim dengan kondisi lebih baik mendapat skor lebih tinggi.
 */
function calculateSquadScore(ratingA, ratingB) {
  const adjA = ratingA.totalAdjustment ?? 0;
  const adjB = ratingB.totalAdjustment ?? 0;

  const clamp = (value) => Math.max(0, Math.min(2, value));
  const scoreA = clamp(2 + adjA);
  const scoreB = clamp(2 + adjB);

  return {
    scoreA: parseFloat(scoreA.toFixed(1)),
    scoreB: parseFloat(scoreB.toFixed(1)),
    maxScore: 2,
  };
}

/**
 * Hitung tingkat keyakinan prediksi (%)
 * Sesuai PRD Seksi 20:
 *   Keyakinan Dasar = 50 + (Selisih Absolut × 7)
 *   Maksimal 85%
 * Pengurangan berdasarkan kelengkapan data dan kondisi skuad.
 */
function calculateConfidence({ totalA, totalB, missingFactors, squadAdjA, squadAdjB, groupStatus, completeness }) {
  const diff = Math.abs(totalA - totalB);
  let confidence = 50 + diff * 7;
  confidence = Math.min(confidence, 85);

  // Pengurangan: data tidak lengkap
  if (missingFactors > 0) confidence -= missingFactors * 5;
  if (completeness < 50) confidence -= 20;
  else if (completeness < 80) confidence -= 10;
  else if (completeness < 90) confidence -= 5;

  // Pengurangan: kondisi skuad buruk
  if (squadAdjA < -1.0 || squadAdjB < -1.0) confidence -= 10;
  else if (squadAdjA < -0.5 || squadAdjB < -0.5) confidence -= 5;

  // Pengurangan: tim sudah gugur (motivasi ambigu)
  if (groupStatus?.sideA?.status === 'already_eliminated' ||
      groupStatus?.sideB?.status === 'already_eliminated') {
    confidence -= 8;
  }

  // Pengurangan: tim sudah lolos (rotasi mungkin)
  if (groupStatus?.sideA?.status === 'already_qualified' ||
      groupStatus?.sideB?.status === 'already_qualified') {
    confidence -= 5;
  }

  if (completeness < 50) confidence = Math.min(confidence, 55);
  else if (completeness < 90) confidence = Math.min(confidence, 75);

  confidence = Math.max(Math.round(confidence), 20);
  return confidence;
}

/**
 * Tentukan pemenang berdasarkan selisih total skor
 * Sesuai PRD Seksi 18.
 */
function determineWinner(totalA, totalB, teamA, teamB) {
  const diff = totalA - totalB;

  if (diff >= 4)       return { winner: teamA, winnerSide: 'A', resultType: 'win_big',   label: `${teamA.name} Menang` };
  if (diff <= -4)      return { winner: teamB, winnerSide: 'B', resultType: 'win_big',   label: `${teamB.name} Menang` };
  if (diff >= 2)       return { winner: teamA, winnerSide: 'A', resultType: 'win_tight', label: `${teamA.name} Menang Tipis` };
  if (diff <= -2)      return { winner: teamB, winnerSide: 'B', resultType: 'win_tight', label: `${teamB.name} Menang Tipis` };
  return { winner: null, winnerSide: null, resultType: 'draw', label: 'Imbang atau Menang Tipis' };
}

/**
 * Prediksi skor akhir berdasarkan logika PRD Seksi 19
 */
function predictScore(resultType, winnerSide, ratingA, ratingB, groupSituation) {
  const mustWinA = groupSituation?.sideA?.status === 'must_win';
  const mustWinB = groupSituation?.sideB?.status === 'must_win';

  // Bandingkan attack vs defense
  const attackA = ratingA.raw?.attack ?? 7;
  const defB    = ratingB.raw?.defense ?? 7;
  const attackB = ratingB.raw?.attack ?? 7;
  const defA    = ratingA.raw?.defense ?? 7;

  const attackAdvA = attackA - defB;
  const attackAdvB = attackB - defA;
  const winnerAttackAdv = winnerSide === 'B' ? attackAdvB : attackAdvA;

  // Situasi wajib menang — skor lebih terbuka
  if (mustWinA || mustWinB) {
    if (resultType === 'win_big')   return winnerAttackAdv > 0.5 ? '3-0' : '2-1';
    if (resultType === 'win_tight') return '2-1';
    return '2-2';
  }

  if (resultType === 'win_big') {
    return winnerAttackAdv > 0.5 ? '3-0' : '2-0';
  }
  if (resultType === 'win_tight') {
    return '1-0';
  }
  // Draw
  if (attackAdvA < -0.3 && attackAdvB < -0.3) return '0-0'; // defense kuat keduanya
  return '1-1';
}

/**
 * Bangun alasan prediksi dalam format array kalimat
 */
function buildReasons(klement, tournament, ratingA, ratingB, squadA, squadB, groupSit, winner) {
  const reasons = [];
  const teamAName = ratingA?.teamName || 'Tim A';
  const teamBName = ratingB?.teamName || 'Tim B';

  // Faktor Klement
  const topKlement = klement.factors.filter(f => f.winnerB || f.winnerA).slice(0, 3);
  topKlement.forEach(f => {
    if (f.winnerA && ratingA) reasons.push(`${teamAName} unggul pada faktor ${f.name}.`);
    if (f.winnerB && ratingB) reasons.push(`${teamBName} unggul pada faktor ${f.name}.`);
  });

  const topStats = (tournament?.components || [])
    .map((c) => ({ ...c, diff: Math.abs((c.scoreA || 0) - (c.scoreB || 0)) }))
    .filter((c) => c.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 2);
  topStats.forEach((c) => {
    if (c.scoreA > c.scoreB) reasons.push(`${teamAName} unggul statistik ${c.label} (${c.valueA} vs ${c.valueB}).`);
    if (c.scoreB > c.scoreA) reasons.push(`${teamBName} unggul statistik ${c.label} (${c.valueB} vs ${c.valueA}).`);
  });

  // Rating pemain
  if (ratingA?.adjustedOverall != null && ratingB?.adjustedOverall != null) {
    if (ratingA.adjustedOverall > ratingB.adjustedOverall + 0.2)
      reasons.push(`${teamAName} memiliki rating pemain lebih tinggi secara keseluruhan (${ratingA.adjustedOverall} vs ${ratingB.adjustedOverall}).`);
    else if (ratingB.adjustedOverall > ratingA.adjustedOverall + 0.2)
      reasons.push(`${teamBName} memiliki rating pemain lebih tinggi secara keseluruhan (${ratingB.adjustedOverall} vs ${ratingA.adjustedOverall}).`);
  }

  // Kondisi skuad
  if (squadA && squadA.length > 0)
    reasons.push(`${teamAName} terpengaruh kondisi skuad: ${squadA.slice(0, 2).map(c => c.text).join('; ')}.`);
  if (squadB && squadB.length > 0)
    reasons.push(`${teamBName} terpengaruh kondisi skuad: ${squadB.slice(0, 2).map(c => c.text).join('; ')}.`);

  // Situasi grup
  if (groupSit?.sideA?.status === 'must_win')
    reasons.push(`${groupSit.sideA.team} wajib menang — kemungkinan bermain lebih agresif.`);
  if (groupSit?.sideB?.status === 'must_win')
    reasons.push(`${groupSit.sideB.team} wajib menang — kemungkinan bermain lebih agresif.`);
  if (groupSit?.sideA?.status === 'already_qualified')
    reasons.push(`${groupSit.sideA.team} sudah lolos — kemungkinan rotasi pemain.`);
  if (groupSit?.sideB?.status === 'already_qualified')
    reasons.push(`${groupSit.sideB.team} sudah lolos — kemungkinan rotasi pemain.`);

  return reasons.slice(0, 6); // maksimal 6 alasan
}

/**
 * Hitung data completeness (%)
 */
function calculateDataCompleteness(klement, ratingA, ratingB, statsScore, groupSit) {
  let available = 0;
  let total = 0;

  // Faktor Klement
  const missingKlement = klement.factors.filter(f => f.dataStatus === 'missing').length;
  total += 6;
  available += (6 - missingKlement);

  // Rating
  total += 2;
  if (ratingA?.dataStatus === 'available') available++;
  else if (ratingA?.dataStatus === 'derived') available += 0.8;
  else if (ratingA?.dataStatus === 'estimated') available += 0.5;
  if (ratingB?.dataStatus === 'available') available++;
  else if (ratingB?.dataStatus === 'derived') available += 0.8;
  else if (ratingB?.dataStatus === 'estimated') available += 0.5;

  // Stats
  total += 2;
  if (statsScore?.dataStatus === 'available') available += 2;
  else if (statsScore?.dataStatus === 'derived') available += 1.6;
  else if (statsScore?.dataStatus === 'partial') available += 1;

  // Group
  total += 1;
  if (groupSit?.dataStatus === 'available') available++;

  return Math.round((available / total) * 100);
}

function isFiniteScore(value) {
  return Number.isFinite(Number(value));
}

function hasAppliedMethod(component) {
  return component.dataStatus !== 'missing'
    && isFiniteScore(component.scoreA)
    && isFiniteScore(component.scoreB)
    && component.applied !== false;
}

function buildFormulaTrace({ klementResult, tournamentResult, ratingResultA, ratingResultB, ratingScore, squadScore, groupSituation }) {
  const klementComplete = (klementResult.factors || []).length >= 6
    && !(klementResult.factors || []).some((f) => f.dataStatus === 'missing');
  const tournamentComplete = ['available', 'derived'].includes(tournamentResult.dataStatus)
    && (tournamentResult.components || []).length > 0;
  const ratingComplete = [ratingResultA.dataStatus, ratingResultB.dataStatus].every((status) => ['available', 'derived'].includes(status))
    && (ratingScore.components || []).length > 0;

  const components = [
    {
      id: 'klement',
      label: '6 Faktor Klement',
      max: 6,
      scoreA: klementResult.scoreA,
      scoreB: klementResult.scoreB,
      dataStatus: klementResult.factors.some((f) => f.dataStatus === 'missing') ? 'partial' : 'available',
      source: 'gdp_population_culture_temperature_fifa_host_wc_form',
      applied: klementComplete,
    },
    {
      id: 'tournament',
      label: 'Statistik Turnamen',
      max: 3,
      scoreA: tournamentResult.scoreA,
      scoreB: tournamentResult.scoreB,
      dataStatus: tournamentResult.dataStatus,
      source: 'wc2026_results_and_derived_team_averages',
      applied: tournamentComplete,
    },
    {
      id: 'rating',
      label: 'Rating Pemain/Lini',
      max: 3,
      scoreA: ratingScore.scoreA,
      scoreB: ratingScore.scoreB,
      dataStatus: ratingComplete ? 'derived' : 'missing',
      source: 'wc2026_team_average_line_ratings',
      applied: ratingComplete,
    },
    {
      id: 'squad',
      label: 'Kondisi Skuad',
      max: 2,
      scoreA: squadScore.scoreA,
      scoreB: squadScore.scoreB,
      dataStatus: 'derived',
      source: 'cards_suspension_rotation_injury_status',
      applied: ratingComplete,
    },
    {
      id: 'group',
      label: 'Situasi Grup',
      max: 1,
      scoreA: groupSituation.scoreA,
      scoreB: groupSituation.scoreB,
      dataStatus: groupSituation.dataStatus,
      source: 'wc2026_group_standings',
      applied: Boolean(groupSituation.sideA && groupSituation.sideB),
    },
  ];

  return {
    version: 'prd-2026-v2',
    maxTotal: 15,
    equation: 'Total = Klement(6) + Statistik Turnamen(3) + Rating Pemain(3) + Kondisi Skuad(2) + Situasi Grup(1)',
    allMethodsApplied: components.every(hasAppliedMethod),
    missingMethods: components
      .filter((component) => !hasAppliedMethod(component))
      .map((component) => component.label),
    components,
  };
}

/**
 * Main function — menggabungkan semua engine
 */
function runPrediction({ teamA, teamB, klementResult, tournamentResult, ratingResultA, ratingResultB, ratingScore, groupSituation }) {
  // --- Skor Kondisi Skuad ---
  const squadScore = calculateSquadScore(ratingResultA, ratingResultB);

  // --- Total Skor ---
  const totalA = klementResult.scoreA + tournamentResult.scoreA + ratingScore.scoreA + squadScore.scoreA + groupSituation.scoreA;
  const totalB = klementResult.scoreB + tournamentResult.scoreB + ratingScore.scoreB + squadScore.scoreB + groupSituation.scoreB;
  const formula = buildFormulaTrace({ klementResult, tournamentResult, ratingResultA, ratingResultB, ratingScore, squadScore, groupSituation });
  const breakdown = {
    klement:    { scoreA: klementResult.scoreA,    scoreB: klementResult.scoreB,    max: 6 },
    tournament: { scoreA: tournamentResult.scoreA, scoreB: tournamentResult.scoreB, max: 3 },
    rating:     { scoreA: ratingScore.scoreA,      scoreB: ratingScore.scoreB,      max: 3 },
    squad:      { scoreA: squadScore.scoreA,        scoreB: squadScore.scoreB,       max: 2 },
    group:      { scoreA: groupSituation.scoreA,   scoreB: groupSituation.scoreB,   max: 1 },
  };

  // Data Completeness
  const completeness = calculateDataCompleteness(
    klementResult, ratingResultA, ratingResultB,
    tournamentResult, groupSituation
  );

  if (!formula.allMethodsApplied) {
    return {
      totalA: parseFloat(totalA.toFixed(1)),
      totalB: parseFloat(totalB.toFixed(1)),
      maxTotal: 15,
      winner: null,
      resultType: 'pending',
      resultLabel: 'Menunggu semua metode PRD',
      predictedScore: null,
      confidence: 0,
      completeness,
      risk: 'High',
      dataStatus: 'incomplete',
      predictionReady: false,
      formulaVersion: 'prd-2026-v2',
      formula,
      reasons: [
        `Prediksi belum dimunculkan karena metode belum lengkap: ${formula.missingMethods.join(', ')}`,
      ],
      breakdown,
      lastUpdated: new Date().toISOString(),
    };
  }

  // --- Pemenang ---
  const winnerResult = determineWinner(totalA, totalB, teamA, teamB);

  // --- Skor Akhir ---
  const predictedScoreRaw = predictScore(
    winnerResult.resultType,
    winnerResult.winnerSide,
    ratingResultA, ratingResultB,
    groupSituation
  );

  // Sesuaikan urutan skor jika tim B yang menang
  let predictedScore = predictedScoreRaw;
  if (winnerResult.winner?.name === teamB.name) {
    const parts = predictedScoreRaw.split('-');
    predictedScore = `${parts[1]}-${parts[0]}`; // balik: A-B
  }

  // --- Keyakinan ---
  const missingFactors = klementResult.factors.filter(f => f.dataStatus === 'missing').length;
  const rawConfidence = calculateConfidence({
    totalA, totalB,
    missingFactors,
    squadAdjA: ratingResultA.totalAdjustment,
    squadAdjB: ratingResultB.totalAdjustment,
    groupStatus: groupSituation,
    completeness,
  });
  const hasDerivedData = [
    tournamentResult.dataStatus,
    ratingResultA.dataStatus,
    ratingResultB.dataStatus,
  ].includes('derived');
  const confidence = hasDerivedData ? Math.min(rawConfidence, 80) : rawConfidence;

  // --- Alasan ---
  const reasons = buildReasons(
    klementResult, tournamentResult, ratingResultA, ratingResultB,
    ratingResultA.conditions, ratingResultB.conditions,
    groupSituation, winnerResult
  );

  // --- Risk Level ---
  const risk = confidence >= 70 ? 'Low' : confidence >= 50 ? 'Medium' : 'High';

  // --- Data Status ---
  const dataStatus = hasDerivedData ? 'partial'
    : completeness >= 90 ? 'complete'
    : completeness >= 50 ? 'partial' : 'incomplete';

  return {
    totalA: parseFloat(totalA.toFixed(1)),
    totalB: parseFloat(totalB.toFixed(1)),
    maxTotal: 15,
    winner: winnerResult.winner,
    resultType: winnerResult.resultType,
    resultLabel: winnerResult.label,
    predictedScore,
    confidence,
    completeness,
    risk,
    dataStatus,
    predictionReady: true,
    formulaVersion: 'prd-2026-v2',
    formula,
    reasons,
    breakdown,
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = { runPrediction, calculateSquadScore };
