'use strict';

const IDEAL_TEMPERATURE = 14;
const GDP_DIMINISHING_LIMIT = 60000;
const HOST_COUNTRIES = ['United States', 'Mexico', 'Canada'];

function round(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isProvided(value) {
  return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function normalizeCultureScore(value) {
  if (!isProvided(value)) return null;
  const numeric = Number(value);
  return numeric > 1 ? clamp(numeric / 10, 0, 1) : clamp(numeric, 0, 1);
}

function getTemperature(team) {
  return team.averageTemperature ?? team.avgTemperature ?? null;
}

function getGoalDifference(stats = {}) {
  if (isProvided(stats.goalDifference)) return Number(stats.goalDifference);
  if (isProvided(stats.goalDiff)) return Number(stats.goalDiff);
  if (isProvided(stats.goalsFor) && isProvided(stats.goalsAgainst)) {
    return Number(stats.goalsFor) - Number(stats.goalsAgainst);
  }
  return null;
}

function getPossession(stats = {}) {
  return stats.possession ?? stats.possessionAvg ?? null;
}

function getPoints(stats = {}) {
  if (isProvided(stats.points)) return Number(stats.points);
  if (isProvided(stats.wins) || isProvided(stats.draws)) {
    return Number(stats.wins || 0) * 3 + Number(stats.draws || 0);
  }
  return null;
}

function hasAnyProvided(object, fields) {
  return fields.some((field) => isProvided(object?.[field]));
}

function getTeamName(team, fallback) {
  return team?.country || team?.name || fallback;
}

function compareWinner(scoreA, scoreB, teamAName, teamBName) {
  if (scoreA > scoreB) return teamAName;
  if (scoreB > scoreA) return teamBName;
  return 'Neutral';
}

function addMissing(dataQuality, fields, factor) {
  fields.forEach((field) => {
    if (!dataQuality.missingFields.includes(field)) dataQuality.missingFields.push(field);
  });
  if (factor && !dataQuality.unavailableFactors.includes(factor)) {
    dataQuality.unavailableFactors.push(factor);
  }
}

function factorRow({ id, factor, maxScore, teamAScore, teamBScore, teamAName, teamBName, explanation, dataStatus = 'available', missingFields = [] }) {
  return {
    id,
    factor,
    maxScore,
    teamAScore: round(teamAScore),
    teamBScore: round(teamBScore),
    winner: compareWinner(teamAScore, teamBScore, teamAName, teamBName),
    explanation,
    dataStatus,
    missingFields,
  };
}

function missingFactor(id, factor, maxScore, missingFields, teamAName, teamBName, dataQuality) {
  addMissing(dataQuality, missingFields, factor);
  return factorRow({
    id,
    factor,
    maxScore,
    teamAScore: 0,
    teamBScore: 0,
    teamAName,
    teamBName,
    dataStatus: 'missing',
    missingFields,
    explanation: `Data ${factor} belum tersedia lengkap, jadi faktor ini tidak diberi poin.`,
  });
}

function effectiveGdp(value) {
  const gdp = Number(value);
  if (gdp <= GDP_DIMINISHING_LIMIT) return gdp;
  return GDP_DIMINISHING_LIMIT + (gdp - GDP_DIMINISHING_LIMIT) * 0.15;
}

function scoreGdp(teamA, teamB, ctx) {
  const missing = [];
  if (!isProvided(teamA.gdpPerCapita)) missing.push('teamAData.gdpPerCapita');
  if (!isProvided(teamB.gdpPerCapita)) missing.push('teamBData.gdpPerCapita');
  if (missing.length) return missingFactor('gdp', 'PDB per kapita', 10, missing, ctx.teamAName, ctx.teamBName, ctx.dataQuality);

  const a = effectiveGdp(teamA.gdpPerCapita);
  const b = effectiveGdp(teamB.gdpPerCapita);
  const diffRatio = Math.abs(a - b) / Math.max(a, b, 1);
  let scoreA = 5;
  let scoreB = 5;
  if (diffRatio >= 0.1) {
    scoreA = a > b ? 10 : 0;
    scoreB = b > a ? 10 : 0;
  }

  const note = Number(teamA.gdpPerCapita) > GDP_DIMINISHING_LIMIT || Number(teamB.gdpPerCapita) > GDP_DIMINISHING_LIMIT
    ? ' Nilai di atas USD 60000 memakai diminishing return.'
    : '';
  return factorRow({
    id: 'gdp',
    factor: 'PDB per kapita',
    maxScore: 10,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Perbandingan PDB efektif: ${ctx.teamAName} ${round(a, 0)} vs ${ctx.teamBName} ${round(b, 0)}.${note}`,
  });
}

function scorePopulationCulture(teamA, teamB, ctx) {
  const cultureA = normalizeCultureScore(teamA.footballCultureScore);
  const cultureB = normalizeCultureScore(teamB.footballCultureScore);
  const missing = [];
  if (!isProvided(teamA.population)) missing.push('teamAData.population');
  if (cultureA == null) missing.push('teamAData.footballCultureScore');
  if (!isProvided(teamB.population)) missing.push('teamBData.population');
  if (cultureB == null) missing.push('teamBData.footballCultureScore');
  if (missing.length) return missingFactor('populationCulture', 'Populasi + budaya sepak bola', 10, missing, ctx.teamAName, ctx.teamBName, ctx.dataQuality);

  const poolA = Number(teamA.population) * cultureA;
  const poolB = Number(teamB.population) * cultureB;
  const diffRatio = Math.abs(poolA - poolB) / Math.max(poolA, poolB, 1);
  let scoreA = 5;
  let scoreB = 5;
  if (diffRatio >= 0.1) {
    scoreA = poolA > poolB ? 10 : 0;
    scoreB = poolB > poolA ? 10 : 0;
  }
  return factorRow({
    id: 'populationCulture',
    factor: 'Populasi + budaya sepak bola',
    maxScore: 10,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Effective talent pool: ${ctx.teamAName} ${round(poolA / 1000000)} juta vs ${ctx.teamBName} ${round(poolB / 1000000)} juta.`,
  });
}

function scoreTemperature(teamA, teamB, ctx) {
  const tempA = getTemperature(teamA);
  const tempB = getTemperature(teamB);
  const missing = [];
  if (!isProvided(tempA)) missing.push('teamAData.averageTemperature');
  if (!isProvided(tempB)) missing.push('teamBData.averageTemperature');
  if (missing.length) return missingFactor('temperature', 'Suhu rata-rata', 10, missing, ctx.teamAName, ctx.teamBName, ctx.dataQuality);

  const distanceA = Math.abs(Number(tempA) - IDEAL_TEMPERATURE);
  const distanceB = Math.abs(Number(tempB) - IDEAL_TEMPERATURE);
  const diff = Math.abs(distanceA - distanceB);
  let scoreA = 5;
  let scoreB = 5;
  if (diff > 0.5) {
    scoreA = distanceA < distanceB ? 10 : 0;
    scoreB = distanceB < distanceA ? 10 : 0;
  }
  return factorRow({
    id: 'temperature',
    factor: 'Suhu rata-rata',
    maxScore: 10,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Jarak ke suhu ideal 14C: ${ctx.teamAName} ${round(distanceA)} vs ${ctx.teamBName} ${round(distanceB)}.`,
  });
}

function scoreFifaRank(teamA, teamB, ctx) {
  const missing = [];
  if (!isProvided(teamA.fifaRank)) missing.push('teamAData.fifaRank');
  if (!isProvided(teamB.fifaRank)) missing.push('teamBData.fifaRank');
  if (missing.length) return missingFactor('fifaRank', 'Ranking FIFA', 15, missing, ctx.teamAName, ctx.teamBName, ctx.dataQuality);

  const rankA = Number(teamA.fifaRank);
  const rankB = Number(teamB.fifaRank);
  let scoreA = 7.5;
  let scoreB = 7.5;
  if (Math.abs(rankA - rankB) > 3) {
    scoreA = rankA < rankB ? 15 : 0;
    scoreB = rankB < rankA ? 15 : 0;
  }
  return factorRow({
    id: 'fifaRank',
    factor: 'Ranking FIFA',
    maxScore: 15,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Ranking lebih kecil lebih baik: ${ctx.teamAName} #${rankA} vs ${ctx.teamBName} #${rankB}.`,
  });
}

function scoreHomeAdvantage(match, teamA, teamB, ctx) {
  const venueCountry = match.venueCountry || match.country || null;
  const hostCountries = match.hostCountries || HOST_COUNTRIES;
  const countryA = getTeamName(teamA, ctx.teamAName);
  const countryB = getTeamName(teamB, ctx.teamBName);
  const isHomeA = venueCountry ? venueCountry === countryA : Boolean(teamA.isHost);
  const isHomeB = venueCountry ? venueCountry === countryB : Boolean(teamB.isHost);
  const isMultiHostNeutral = venueCountry && hostCountries.includes(venueCountry) && venueCountry !== countryA && venueCountry !== countryB;

  let scoreA = 0;
  let scoreB = 0;
  if (isHomeA && !isHomeB) scoreA = 5;
  if (isHomeB && !isHomeA) scoreB = 5;

  return factorRow({
    id: 'homeAdvantage',
    factor: 'Tuan rumah',
    maxScore: 5,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: isMultiHostNeutral
      ? `Laga dimainkan di negara host netral (${venueCountry}); tidak ada tim yang mendapat poin tuan rumah.`
      : scoreA > scoreB
        ? `${ctx.teamAName} mendapat keuntungan bermain di negara sendiri.`
        : scoreB > scoreA
          ? `${ctx.teamBName} mendapat keuntungan bermain di negara sendiri.`
          : 'Tidak ada keuntungan tuan rumah yang jelas.',
  });
}

function scoreCurrentForm(statsA, statsB, ctx) {
  const pointsA = getPoints(statsA);
  const pointsB = getPoints(statsB);
  const missing = [];
  if (!isProvided(pointsA)) missing.push('teamAData.tournamentStats.wins/draws/points');
  if (!isProvided(pointsB)) missing.push('teamBData.tournamentStats.wins/draws/points');
  if (missing.length) return missingFactor('currentFormResults', 'Hasil turnamen', 10, missing, ctx.teamAName, ctx.teamBName, ctx.dataQuality);

  let scoreA = 5;
  let scoreB = 5;
  const diff = pointsA - pointsB;
  if (Math.abs(diff) === 1) {
    scoreA = diff > 0 ? 6 : 4;
    scoreB = diff < 0 ? 6 : 4;
  } else if (diff !== 0) {
    scoreA = diff > 0 ? 10 : 0;
    scoreB = diff < 0 ? 10 : 0;
  }

  return factorRow({
    id: 'currentFormResults',
    factor: 'Hasil turnamen',
    maxScore: 10,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Poin turnamen: ${ctx.teamAName} ${pointsA} vs ${ctx.teamBName} ${pointsB}.`,
  });
}

function metricVote(votes, a, b, lowerIsBetter = false, threshold = 0) {
  if (!isProvided(a) || !isProvided(b)) return;
  const diff = lowerIsBetter ? Number(b) - Number(a) : Number(a) - Number(b);
  if (diff > threshold) votes.a += 1;
  else if (diff < -threshold) votes.b += 1;
  else votes.tie += 1;
}

function scoreGoalRecord(statsA, statsB, ctx) {
  const missingFields = [];
  const needed = ['goalsFor', 'goalsAgainst'];
  if (!hasAnyProvided(statsA, needed)) missingFields.push('teamAData.tournamentStats.goalsFor/goalsAgainst');
  if (!hasAnyProvided(statsB, needed)) missingFields.push('teamBData.tournamentStats.goalsFor/goalsAgainst');
  if (missingFields.length) return missingFactor('goalRecord', 'Gol dan kebobolan', 8, missingFields, ctx.teamAName, ctx.teamBName, ctx.dataQuality);

  const votes = { a: 0, b: 0, tie: 0 };
  metricVote(votes, statsA.goalsFor, statsB.goalsFor, false, 0);
  metricVote(votes, statsA.goalsAgainst, statsB.goalsAgainst, true, 0);
  metricVote(votes, getGoalDifference(statsA), getGoalDifference(statsB), false, 0);
  metricVote(votes, statsA.cleanSheets, statsB.cleanSheets, false, 0);

  let scoreA = 4;
  let scoreB = 4;
  if (votes.a - votes.b >= 2) [scoreA, scoreB] = [8, 0];
  else if (votes.b - votes.a >= 2) [scoreA, scoreB] = [0, 8];
  else if (votes.a > votes.b) [scoreA, scoreB] = [5, 3];
  else if (votes.b > votes.a) [scoreA, scoreB] = [3, 5];

  return factorRow({
    id: 'goalRecord',
    factor: 'Gol dan kebobolan',
    maxScore: 8,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Dibandingkan dari gol, kebobolan, selisih gol, dan clean sheet.`,
  });
}

function scoreAttackStats(statsA, statsB, ctx) {
  const metrics = [
    ['xG', 'xG', 0.05],
    ['shots', 'shots', 1],
    ['shotsOnTarget', 'shots on target', 1],
    ['bigChances', 'big chances', 1],
    ['conversionRate', 'conversion rate', 0.01],
  ];
  const available = metrics.filter(([field]) => isProvided(statsA?.[field]) && isProvided(statsB?.[field]));
  if (available.length === 0) {
    return missingFactor('attackStats', 'Statistik serangan', 7, ['teamAData.tournamentStats.attackStats', 'teamBData.tournamentStats.attackStats'], ctx.teamAName, ctx.teamBName, ctx.dataQuality);
  }

  const votes = { a: 0, b: 0, tie: 0 };
  available.forEach(([field, , threshold]) => metricVote(votes, statsA[field], statsB[field], false, threshold));

  let scoreA = 3.5;
  let scoreB = 3.5;
  if (votes.a - votes.b >= 2) [scoreA, scoreB] = [7, 0];
  else if (votes.b - votes.a >= 2) [scoreA, scoreB] = [0, 7];
  else if (votes.a > votes.b) [scoreA, scoreB] = [5, 2];
  else if (votes.b > votes.a) [scoreA, scoreB] = [2, 5];

  const xgNote = available.some(([field]) => field === 'xG') ? 'xG tersedia.' : 'xG unavailable; memakai metrik serangan lain.';
  return factorRow({
    id: 'attackStats',
    factor: 'Statistik serangan',
    maxScore: 7,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `${xgNote} Metrik dibandingkan: ${available.map(([, label]) => label).join(', ')}.`,
  });
}

function scoreControlStats(statsA, statsB, ctx) {
  const normalizedA = { ...statsA, possession: getPossession(statsA) };
  const normalizedB = { ...statsB, possession: getPossession(statsB) };
  const metrics = [
    ['possession', 'possession', 2],
    ['passAccuracy', 'pass accuracy', 1],
    ['fieldTilt', 'field tilt', 1],
    ['tempoControl', 'tempo control', 1],
  ];
  const available = metrics.filter(([field]) => isProvided(normalizedA[field]) && isProvided(normalizedB[field]));
  if (available.length === 0) {
    return missingFactor('controlStats', 'Kontrol permainan', 5, ['teamAData.tournamentStats.possession', 'teamBData.tournamentStats.possession'], ctx.teamAName, ctx.teamBName, ctx.dataQuality);
  }

  const votes = { a: 0, b: 0, tie: 0 };
  available.forEach(([field, , threshold]) => metricVote(votes, normalizedA[field], normalizedB[field], false, threshold));

  let scoreA = 2.5;
  let scoreB = 2.5;
  if (votes.a - votes.b >= 2) [scoreA, scoreB] = [5, 0];
  else if (votes.b - votes.a >= 2) [scoreA, scoreB] = [0, 5];
  else if (votes.a > votes.b) [scoreA, scoreB] = [3, 2];
  else if (votes.b > votes.a) [scoreA, scoreB] = [2, 3];

  return factorRow({
    id: 'controlStats',
    factor: 'Kontrol permainan',
    maxScore: 5,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Kontrol dibandingkan lewat ${available.map(([, label]) => label).join(', ')}.`,
  });
}

function importancePenalty(player, type) {
  const importance = String(player?.importance || player?.role || player?.playerImportance || '').toLowerCase();
  const key = player?.isKeyPlayer || importance.includes('key') || importance.includes('kapten') || importance.includes('captain') || importance.includes('playmaker');
  const core = importance.includes('core') || importance.includes('inti') || importance.includes('starter');
  const rotation = importance.includes('rotation') || importance.includes('rotasi');
  if (key) return type === 'injury' ? 4.5 : 5;
  if (core) return 3;
  if (rotation) return 1;
  return type === 'injury' ? 2 : 1;
}

function listPenalty(players, type, doubtful = false) {
  if (!Array.isArray(players)) return 0;
  return players.reduce((sum, player) => sum + importancePenalty(player, type) * (doubtful ? 0.5 : 1), 0);
}

function scoreDiscipline(statsA, statsB, squadA, squadB, ctx) {
  const scoreTeam = (stats = {}, squad = {}) => {
    let penalty = 0;
    penalty += listPenalty(squad.suspendedPlayers, 'suspension');
    penalty += Math.min(5, Number(stats.redCards || 0) * 2);
    if (!ctx.cardRules?.resetBeforeStage) {
      const risk = Array.isArray(stats.accumulatedCardRisk) ? stats.accumulatedCardRisk.length : Number(stats.accumulatedCardRisk || 0);
      penalty += clamp(risk * 0.5, 0, 2);
    }
    return clamp(5 - penalty, 0, 5);
  };
  const scoreA = scoreTeam(statsA, squadA);
  const scoreB = scoreTeam(statsB, squadB);
  return factorRow({
    id: 'disciplineAvailability',
    factor: 'Kartu / suspensi',
    maxScore: 5,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: 'Dimulai dari 5 poin lalu dikurangi karena suspensi, kartu merah, dan risiko akumulasi kartu.',
  });
}

function scoreInjuryAvailability(squadA, squadB, ctx) {
  const scoreTeam = (squad = {}) => {
    const penalty =
      listPenalty(squad.injuredPlayers, 'injury') +
      listPenalty(squad.unavailablePlayers, 'injury') +
      listPenalty(squad.doubtfulPlayers, 'injury', true);
    return clamp(5 - penalty, 0, 5);
  };
  const scoreA = scoreTeam(squadA);
  const scoreB = scoreTeam(squadB);
  return factorRow({
    id: 'injuryAvailability',
    factor: 'Cedera pemain',
    maxScore: 5,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: 'Dimulai dari 5 poin lalu dikurangi berdasarkan cedera, doubtful, dan pemain unavailable.',
  });
}

function keyPlayerAverage(playerRatings = {}) {
  if (!Array.isArray(playerRatings.keyPlayers) || playerRatings.keyPlayers.length === 0) return null;
  const ratings = playerRatings.keyPlayers
    .map((player) => player.rating ?? player.averageRating)
    .filter(isProvided)
    .map(Number);
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function scorePlayerRating(ratingsA = {}, ratingsB = {}, ctx) {
  const avgA = ratingsA.averageRating ?? ratingsA.average ?? ratingsA.adjustedOverall ?? null;
  const avgB = ratingsB.averageRating ?? ratingsB.average ?? ratingsB.adjustedOverall ?? null;
  const keyA = keyPlayerAverage(ratingsA);
  const keyB = keyPlayerAverage(ratingsB);
  if (!isProvided(avgA) || !isProvided(avgB)) {
    return missingFactor('playerRating', 'Rating pemain', 5, ['teamAData.playerRatings.averageRating', 'teamBData.playerRatings.averageRating'], ctx.teamAName, ctx.teamBName, ctx.dataQuality);
  }

  const compositeA = Number(avgA) + (keyA == null ? 0 : (keyA - Number(avgA)) * 0.35);
  const compositeB = Number(avgB) + (keyB == null ? 0 : (keyB - Number(avgB)) * 0.35);
  const diff = compositeA - compositeB;
  let scoreA = 2.5;
  let scoreB = 2.5;
  if (Math.abs(diff) > 0.4) {
    scoreA = diff > 0 ? 5 : 0;
    scoreB = diff < 0 ? 5 : 0;
  } else if (Math.abs(diff) > 0.12) {
    scoreA = diff > 0 ? 3 : 2;
    scoreB = diff < 0 ? 3 : 2;
  }
  return factorRow({
    id: 'playerRating',
    factor: 'Rating pemain',
    maxScore: 5,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Komposit rating pemain: ${ctx.teamAName} ${round(compositeA, 2)} vs ${ctx.teamBName} ${round(compositeB, 2)}.`,
  });
}

function mentalValue(value) {
  if (!isProvided(value)) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return clamp(numeric, 0, 5);
  return null;
}

function scoreMentalProfile(profile = {}) {
  const fields = [
    'knockoutExperience',
    'comebackRecord',
    'lateGoals',
    'penaltyRecord',
    'seniorLeadership',
    'responseAfterConceding',
    'tournamentHistory',
    'recentMomentum',
  ];
  const values = fields.map((field) => mentalValue(profile[field])).filter((value) => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreMental(teamA, teamB, ctx) {
  const mentalA = scoreMentalProfile(teamA.mentalProfile);
  const mentalB = scoreMentalProfile(teamB.mentalProfile);
  if (mentalA == null || mentalB == null) {
    return missingFactor('mental', 'Mental pemain', 5, ['teamAData.mentalProfile', 'teamBData.mentalProfile'], ctx.teamAName, ctx.teamBName, ctx.dataQuality);
  }
  const diff = mentalA - mentalB;
  let scoreA = 2.5;
  let scoreB = 2.5;
  if (Math.abs(diff) > 1.2) {
    scoreA = diff > 0 ? 5 : 0;
    scoreB = diff < 0 ? 5 : 0;
  } else if (Math.abs(diff) > 0.2) {
    scoreA = diff > 0 ? 3 : 2;
    scoreB = diff < 0 ? 3 : 2;
  }
  return factorRow({
    id: 'mental',
    factor: 'Mental pemain',
    maxScore: 5,
    teamAScore: scoreA,
    teamBScore: scoreB,
    teamAName: ctx.teamAName,
    teamBName: ctx.teamBName,
    explanation: `Skor mental berbasis bukti: ${ctx.teamAName} ${round(mentalA, 2)} vs ${ctx.teamBName} ${round(mentalB, 2)}.`,
  });
}

function calculateConfidence(scoreDifference) {
  if (scoreDifference >= 15) return clamp(75 + Math.min(10, Math.round((scoreDifference - 15) / 3)), 75, 85);
  if (scoreDifference >= 8) return clamp(65 + Math.round((scoreDifference - 8) * 1.3), 65, 74);
  if (scoreDifference >= 4) return clamp(55 + Math.round((scoreDifference - 4) * 2), 55, 64);
  return clamp(50 + Math.round(scoreDifference), 50, 54);
}

function predictionStatus(diff) {
  if (diff >= 15) return 'Strong favorite';
  if (diff >= 4) return 'Slight favorite';
  if (diff <= 3) return 'Balanced match';
  return 'High risk prediction';
}

function isKnockout(stage = '') {
  return /round|last|quarter|semi|final|32|16/i.test(stage);
}

function predictedScore(diff, winnerSide, stage) {
  if (diff <= 1 && isKnockout(stage)) return '1-1';
  if (diff <= 3) return '1-1';
  let winnerGoals = 2;
  let loserGoals = 1;
  if (diff >= 15) {
    winnerGoals = 2;
    loserGoals = 0;
  }
  return winnerSide === 'B' ? `${loserGoals}-${winnerGoals}` : `${winnerGoals}-${loserGoals}`;
}

function buildReasons(rows, teamAName, teamBName) {
  return rows
    .filter((row) => row.dataStatus !== 'missing')
    .map((row) => ({ ...row, diff: Math.abs(row.teamAScore - row.teamBScore) }))
    .filter((row) => row.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 3)
    .map((row) => `${row.winner === teamAName || row.winner === teamBName ? row.winner : 'Kedua tim'} unggul pada faktor ${row.factor}: ${row.explanation}`);
}

function buildRiskNotes(rows, prediction, dataQuality) {
  const notes = [];
  if (prediction.isCloseMatch) notes.push('Selisih skor model kecil; pertandingan sangat ketat.');
  if (prediction.extraTimeRisk) notes.push('Ada peluang extra time karena selisih model sangat tipis.');
  if (prediction.penaltyRisk) notes.push('Risiko adu penalti meningkat pada fase gugur.');
  if (dataQuality.unavailableFactors.length) notes.push('Beberapa data belum tersedia atau belum final.');
  const availabilityRows = rows.filter((row) => ['Kartu / suspensi', 'Cedera pemain'].includes(row.factor));
  if (availabilityRows.some((row) => row.teamAScore < row.maxScore || row.teamBScore < row.maxScore)) {
    notes.push('Prediksi bisa berubah jika lineup resmi, cedera, atau suspensi diperbarui.');
  }
  return notes;
}

function calculateMatchPrediction(input) {
  const match = input.match || {};
  const teamA = input.teamAData || {};
  const teamB = input.teamBData || {};
  const statsA = teamA.tournamentStats || {};
  const statsB = teamB.tournamentStats || {};
  const squadA = teamA.squadStatus || {};
  const squadB = teamB.squadStatus || {};
  const teamAName = match.teamA || getTeamName(teamA, 'Team A');
  const teamBName = match.teamB || getTeamName(teamB, 'Team B');
  const dataQuality = {
    missingFields: [],
    unavailableFactors: [],
    manualSources: input.manualSources || [],
    ignoredManualFields: input.ignoredManualFields || [],
    lastUpdated: new Date().toISOString(),
  };
  const ctx = {
    teamAName,
    teamBName,
    dataQuality,
    cardRules: match.tournamentCardRules || {},
  };

  const breakdown = [
    scoreGdp(teamA, teamB, ctx),
    scorePopulationCulture(teamA, teamB, ctx),
    scoreTemperature(teamA, teamB, ctx),
    scoreFifaRank(teamA, teamB, ctx),
    scoreHomeAdvantage(match, teamA, teamB, ctx),
    scoreCurrentForm(statsA, statsB, ctx),
    scoreGoalRecord(statsA, statsB, ctx),
    scoreAttackStats(statsA, statsB, ctx),
    scoreControlStats(statsA, statsB, ctx),
    scoreDiscipline(statsA, statsB, squadA, squadB, ctx),
    scoreInjuryAvailability(squadA, squadB, ctx),
    scorePlayerRating(teamA.playerRatings, teamB.playerRatings, ctx),
    scoreMental(teamA, teamB, ctx),
  ];

  const totalA = round(breakdown.reduce((sum, row) => sum + row.teamAScore, 0));
  const totalB = round(breakdown.reduce((sum, row) => sum + row.teamBScore, 0));
  const diff = Math.abs(totalA - totalB);
  const winner = totalA > totalB ? teamAName : totalB > totalA ? teamBName : 'Draw / Too close';
  const winnerSide = totalA > totalB ? 'A' : totalB > totalA ? 'B' : null;
  const extraTimeRisk = diff <= 1;
  const penaltyRisk = extraTimeRisk && isKnockout(match.stage);
  const prediction = {
    winner,
    predictedScore: predictedScore(diff, winnerSide, match.stage),
    confidence: calculateConfidence(diff),
    status: predictionStatus(diff),
    isCloseMatch: diff <= 3,
    extraTimeRisk,
    penaltyRisk,
  };

  const keyReasons = buildReasons(breakdown, teamAName, teamBName);
  const riskNotes = buildRiskNotes(breakdown, prediction, dataQuality);

  return {
    match: {
      teamA: teamAName,
      teamB: teamBName,
      tournament: match.tournament || 'World Cup 2026',
      stage: match.stage,
      matchDate: match.matchDate,
      venue: match.venue,
      venueCountry: match.venueCountry,
      hostCountries: match.hostCountries || HOST_COUNTRIES,
    },
    prediction,
    totalScore: { teamA: totalA, teamB: totalB },
    maxTotal: 100,
    breakdown,
    keyReasons,
    riskNotes,
    dataQuality,
  };
}

module.exports = {
  calculateMatchPrediction,
  normalizeCultureScore,
};
