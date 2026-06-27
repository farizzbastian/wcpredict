'use strict';

/**
 * Player Rating Engine
 * Menghitung rating tim berdasarkan:
 * - Rata-rata Starting XI
 * - Rating per lini (GK, DEF, MID, FWD)
 * - Rating pemain kunci
 * Lalu mengoreksi berdasarkan cedera, suspensi, dan rotasi.
 */

// Bobot pengurangan rating berdasarkan tingkat cedera
const INJURY_DEDUCTIONS = {
  fit:             0,
  injured_light:  -0.15,
  injured_medium: -0.35,
  injured_heavy:  -0.8,
};

// Bobot pengurangan untuk suspensi
const SUSPENSION_DEDUCTION_KEY   = -0.7;  // pemain kunci
const SUSPENSION_DEDUCTION_OTHER = -0.35; // pemain biasa

/**
 * @param {Array} players - daftar pemain dari players.js (satu tim)
 * @returns {object} hasil kalkulasi rating
 */
function calculateTeamRating(players) {
  const starters = players.filter(p => p.isStartingXI);

  // ---- Rating mentah per posisi ----
  const byPosition = (pos) => starters.filter(p => p.position === pos);
  const avg = (arr) => arr.length === 0 ? null : arr.reduce((s, p) => s + p.averageRating, 0) / arr.length;

  const rawRatings = {
    overall:    avg(starters),
    keeper:     avg(byPosition('GK')),
    defense:    avg(byPosition('DEF')),
    midfield:   avg(byPosition('MID')),
    attack:     avg(byPosition('FWD')),
    keyPlayers: avg(starters.filter(p => p.isKeyPlayer)),
  };

  // ---- Kondisi skuad & koreksi ----
  const conditions = [];
  let totalAdjustment = 0;

  starters.forEach(p => {
    // Cedera
    const injAdj = INJURY_DEDUCTIONS[p.injuryStatus] ?? 0;
    if (injAdj !== 0) {
      const severity = p.injuryStatus.replace('injured_', '');
      conditions.push({
        type: 'injury',
        icon: '🩹',
        text: `${p.name} (${p.position}) cedera ${severity}`,
        adjustment: injAdj,
        isKeyPlayer: p.isKeyPlayer,
      });
      totalAdjustment += injAdj;
    }

    // Suspensi
    if (p.suspensionStatus === 'suspended') {
      const susAdj = p.isKeyPlayer ? SUSPENSION_DEDUCTION_KEY : SUSPENSION_DEDUCTION_OTHER;
      conditions.push({
        type: 'suspension',
        icon: '🟥',
        text: `${p.name} (${p.position}) terkena suspensi`,
        adjustment: susAdj,
        isKeyPlayer: p.isKeyPlayer,
      });
      totalAdjustment += susAdj;
    }

    // Risiko rotasi — kurangi kontribusi proporsional
    if (p.rotationRisk > 0.25) {
      const rotAdj = -(p.averageRating * p.rotationRisk * 0.1);
      conditions.push({
        type: 'rotation',
        icon: '🔄',
        text: `${p.name} (${p.position}) risiko rotasi ${Math.round(p.rotationRisk * 100)}%`,
        adjustment: parseFloat(rotAdj.toFixed(2)),
        isKeyPlayer: p.isKeyPlayer,
      });
      totalAdjustment += rotAdj;
    }
  });

  // Rating disesuaikan
  const adjustedOverall = rawRatings.overall != null
    ? parseFloat((rawRatings.overall + totalAdjustment).toFixed(2))
    : null;

  // ---- Skor Rating (0-3) ----
  // Dikembalikan mentah — perbandingan dilakukan di predictionEngine
  return {
    raw: rawRatings,
    adjustedOverall,
    totalAdjustment: parseFloat(totalAdjustment.toFixed(2)),
    conditions,
    players: players.map(p => ({
      no: p.no, name: p.name, position: p.position,
      isStartingXI: p.isStartingXI, isKeyPlayer: p.isKeyPlayer,
      averageRating: p.averageRating,
      injuryStatus: p.injuryStatus,
      suspensionStatus: p.suspensionStatus,
      rotationRisk: p.rotationRisk,
    })),
    dataStatus: 'available',
  };
}

/**
 * Bandingkan rating dua tim dan berikan skor (0-3)
 * Perbandingan: overall, attack vs defense lawan, gelandang
 */
function compareRatings(ratingA, ratingB) {
  let scoreA = 0;
  let scoreB = 0;
  const components = [];

  const addCompare = (id, label, a, b, weight, threshold = 0.15) => {
    let addA = 0;
    let addB = 0;
    if (a != null && b != null) {
      if (a > b + threshold) addA = weight;
      else if (b > a + threshold) addB = weight;
      else {
        addA = weight / 2;
        addB = weight / 2;
      }
    }
    scoreA += addA;
    scoreB += addB;
    components.push({
      id,
      label,
      valueA: a,
      valueB: b,
      scoreA: parseFloat(addA.toFixed(2)),
      scoreB: parseFloat(addB.toFixed(2)),
      weight,
    });
  };

  addCompare('overall', 'Overall rating', ratingA.adjustedOverall, ratingB.adjustedOverall, 0.7, 0.2);
  addCompare('key_players', 'Pemain kunci', ratingA.raw.keyPlayers, ratingB.raw.keyPlayers, 0.55, 0.2);
  addCompare('attack_vs_defense', 'Serangan vs pertahanan lawan', ratingA.raw.attack - ratingB.raw.defense, ratingB.raw.attack - ratingA.raw.defense, 0.65, 0.15);
  addCompare('keeper_resistance', 'Kiper vs ancaman serangan', ratingA.raw.keeper - ratingB.raw.attack, ratingB.raw.keeper - ratingA.raw.attack, 0.45, 0.15);
  addCompare('midfield', 'Dominasi gelandang', ratingA.raw.midfield, ratingB.raw.midfield, 0.65, 0.15);

  // Cap ke max 3
  scoreA = Math.min(parseFloat(scoreA.toFixed(1)), 3);
  scoreB = Math.min(parseFloat(scoreB.toFixed(1)), 3);

  return { scoreA, scoreB, maxScore: 3, components };
}

module.exports = { calculateTeamRating, compareRatings };
