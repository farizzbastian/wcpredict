'use strict';

/**
 * Tournament Stats Engine
 * Bobot PRD: Statistik Turnamen maksimal 3 poin.
 *
 * Komponen yang dipakai:
 * - Form hasil WC 2026: win/draw/loss, poin per laga, selisih gol
 * - Serangan: gol, xG, shots, shots on target
 * - Kontrol: possession
 * - Pertahanan: kebobolan dan clean performance
 * - Disiplin: kartu kuning, kartu merah, suspensi
 *
 * Data xG/shots/possession/cards bisa berstatus `derived` saat provider tidak
 * menyediakan official advanced stats. Tetap dipakai sebagai input prediksi,
 * tetapi status data tidak dianggap official complete.
 */

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function perMatch(value, matchesPlayed) {
  return matchesPlayed > 0 ? value / matchesPlayed : 0;
}

function compareMetric(score, a, b, weight, threshold, lowerIsBetter = false) {
  if (a == null || b == null) {
    score.missing += 1;
    return;
  }

  const diff = lowerIsBetter ? b - a : a - b;
  if (diff > threshold) score.a += weight;
  else if (diff < -threshold) score.b += weight;
  else {
    score.a += weight / 2;
    score.b += weight / 2;
  }
}

function buildProfile(stats) {
  const mp = Math.max(stats.matchesPlayed || 0, 1);
  return {
    ppg: perMatch((stats.wins || 0) * 3 + (stats.draws || 0), mp),
    goalDiffPerMatch: perMatch(stats.goalDiff || 0, mp),
    goalsForPerMatch: perMatch(stats.goalsFor || 0, mp),
    goalsAgainstPerMatch: perMatch(stats.goalsAgainst || 0, mp),
    xgPerMatch: perMatch(stats.xg || 0, mp),
    shotsPerMatch: perMatch(stats.shots || 0, mp),
    shotsOnTargetPerMatch: perMatch(stats.shotsOnTarget || 0, mp),
    possessionAvg: stats.possessionAvg ?? 50,
    yellowCardsPerMatch: perMatch(stats.yellowCards || 0, mp),
    redCardsPerMatch: perMatch(stats.redCards || 0, mp),
    suspensions: stats.suspensions || 0,
  };
}

function calculateTournamentScore(statsA, statsB) {
  if (!statsA || !statsB) {
    return {
      scoreA: 0,
      scoreB: 0,
      maxScore: 3,
      dataStatus: 'missing',
      missing: ['tournament_stats'],
      components: [],
    };
  }

  const a = buildProfile(statsA);
  const b = buildProfile(statsB);
  const score = { a: 0, b: 0, missing: 0 };

  const components = [
    {
      id: 'form',
      label: 'Form hasil turnamen',
      weight: 0.75,
      a: a.ppg + a.goalDiffPerMatch * 0.25,
      b: b.ppg + b.goalDiffPerMatch * 0.25,
      threshold: 0.2,
      detail: 'Poin per laga dan selisih gol selama WC 2026.',
    },
    {
      id: 'attack_volume',
      label: 'Kekuatan serangan',
      weight: 0.85,
      a: a.xgPerMatch * 0.45 + a.shotsOnTargetPerMatch * 0.25 + a.shotsPerMatch * 0.05 + a.goalsForPerMatch * 0.35,
      b: b.xgPerMatch * 0.45 + b.shotsOnTargetPerMatch * 0.25 + b.shotsPerMatch * 0.05 + b.goalsForPerMatch * 0.35,
      threshold: 0.18,
      detail: 'Gabungan xG, shots, shots on target, dan gol per laga.',
    },
    {
      id: 'control',
      label: 'Kontrol pertandingan',
      weight: 0.35,
      a: a.possessionAvg,
      b: b.possessionAvg,
      threshold: 3,
      detail: 'Rata-rata possession selama turnamen.',
    },
    {
      id: 'defense',
      label: 'Ketahanan pertahanan',
      weight: 0.65,
      a: a.goalsAgainstPerMatch + a.redCardsPerMatch * 0.5,
      b: b.goalsAgainstPerMatch + b.redCardsPerMatch * 0.5,
      threshold: 0.2,
      lowerIsBetter: true,
      detail: 'Kebobolan per laga dan penalti kartu merah.',
    },
    {
      id: 'discipline',
      label: 'Disiplin skuad',
      weight: 0.4,
      a: a.yellowCardsPerMatch + a.redCardsPerMatch * 2 + a.suspensions * 0.8,
      b: b.yellowCardsPerMatch + b.redCardsPerMatch * 2 + b.suspensions * 0.8,
      threshold: 0.25,
      lowerIsBetter: true,
      detail: 'Kartu kuning, kartu merah, dan suspensi.',
    },
  ];

  const resolved = components.map((component) => {
    const beforeA = score.a;
    const beforeB = score.b;
    compareMetric(
      score,
      component.a,
      component.b,
      component.weight,
      component.threshold,
      component.lowerIsBetter
    );

    return {
      id: component.id,
      label: component.label,
      weight: component.weight,
      valueA: round(component.a),
      valueB: round(component.b),
      scoreA: round(score.a - beforeA),
      scoreB: round(score.b - beforeB),
      detail: component.detail,
    };
  });

  const hasDerivedStats = statsA.dataStatus === 'derived' || statsB.dataStatus === 'derived';
  const advancedAvailable = Boolean(statsA.advancedStatsAvailable && statsB.advancedStatsAvailable);

  return {
    scoreA: round(Math.min(score.a, 3), 1),
    scoreB: round(Math.min(score.b, 3), 1),
    maxScore: 3,
    dataStatus: hasDerivedStats ? 'derived' : advancedAvailable ? 'available' : 'partial',
    components: resolved,
    profiles: { teamA: a, teamB: b },
    statsA,
    statsB,
  };
}

module.exports = { calculateTournamentScore };
