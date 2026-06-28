'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMatchPrediction } = require('../src/engine/klementScoring');

function baseInput(overrides = {}) {
  const input = {
    match: {
      teamA: 'Team A',
      teamB: 'Team B',
      tournament: 'World Cup 2026',
      stage: 'Round of 32',
      matchDate: '2026-07-01',
      venueCountry: 'Canada',
      hostCountries: ['United States', 'Mexico', 'Canada'],
    },
    teamAData: {
      country: 'Team A',
      fifaRank: 8,
      gdpPerCapita: 30000,
      population: 50000000,
      footballCultureScore: 1,
      averageTemperature: 15,
      isHost: false,
      tournamentStats: {
        matchesPlayed: 3,
        wins: 2,
        draws: 1,
        losses: 0,
        goalsFor: 6,
        goalsAgainst: 2,
        goalDifference: 4,
        xG: 5.8,
        shots: 42,
        shotsOnTarget: 17,
        possession: 55,
        cleanSheets: 1,
        yellowCards: 3,
        redCards: 0,
      },
      squadStatus: {
        injuredPlayers: [],
        doubtfulPlayers: [],
        suspendedPlayers: [],
        unavailablePlayers: [],
      },
      playerRatings: {
        averageRating: 7.5,
        keyPlayers: [{ rating: 8, importance: 'key' }],
      },
      mentalProfile: {
        knockoutExperience: 4,
        comebackRecord: 3,
        lateGoals: 3,
        penaltyRecord: 3,
        seniorLeadership: 4,
        recentMomentum: 4,
      },
    },
    teamBData: {
      country: 'Team B',
      fifaRank: 18,
      gdpPerCapita: 12000,
      population: 30000000,
      footballCultureScore: 0.75,
      averageTemperature: 20,
      isHost: false,
      tournamentStats: {
        matchesPlayed: 3,
        wins: 1,
        draws: 1,
        losses: 1,
        goalsFor: 3,
        goalsAgainst: 4,
        goalDifference: -1,
        xG: 3.2,
        shots: 28,
        shotsOnTarget: 9,
        possession: 48,
        cleanSheets: 0,
        yellowCards: 5,
        redCards: 1,
      },
      squadStatus: {
        injuredPlayers: [],
        doubtfulPlayers: [],
        suspendedPlayers: [],
        unavailablePlayers: [],
      },
      playerRatings: {
        averageRating: 6.9,
        keyPlayers: [{ rating: 7.1, importance: 'key' }],
      },
      mentalProfile: {
        knockoutExperience: 2,
        comebackRecord: 2,
        lateGoals: 1,
        penaltyRecord: 2,
        seniorLeadership: 2,
        recentMomentum: 2,
      },
    },
  };

  return deepMerge(input, overrides);
}

function deepMerge(target, source) {
  if (!source) return target;
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] || {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

test('returns complete reusable JSON with all scoring rows', () => {
  const result = calculateMatchPrediction(baseInput());
  assert.equal(result.maxTotal, 100);
  assert.equal(result.breakdown.length, 13);
  assert.equal(result.prediction.winner, 'Team A');
  assert.ok(result.prediction.confidence >= 50);
  assert.ok(result.keyReasons.length > 0);
});

test('does not crash with partial missing data and records dataQuality', () => {
  const result = calculateMatchPrediction(baseInput({
    teamAData: { fifaRank: null, playerRatings: { averageRating: null, keyPlayers: [] } },
    teamBData: { fifaRank: null, playerRatings: { averageRating: null, keyPlayers: [] } },
  }));
  assert.equal(result.breakdown.length, 13);
  assert.ok(result.dataQuality.missingFields.includes('teamAData.fifaRank'));
  assert.ok(result.dataQuality.unavailableFactors.includes('Ranking FIFA'));
  assert.ok(Number.isFinite(result.totalScore.teamA));
});

test('neutral match gives no home advantage points', () => {
  const result = calculateMatchPrediction(baseInput({
    match: { venueCountry: 'Canada' },
    teamAData: { country: 'Team A', isHost: false },
    teamBData: { country: 'Team B', isHost: false },
  }));
  const home = result.breakdown.find((row) => row.id === 'homeAdvantage');
  assert.equal(home.teamAScore, 0);
  assert.equal(home.teamBScore, 0);
});

test('key injury reduces injury availability score', () => {
  const result = calculateMatchPrediction(baseInput({
    teamAData: {
      squadStatus: {
        injuredPlayers: [{ name: 'Captain', importance: 'key' }],
        doubtfulPlayers: [],
        suspendedPlayers: [],
        unavailablePlayers: [],
      },
    },
  }));
  const injury = result.breakdown.find((row) => row.id === 'injuryAvailability');
  assert.ok(injury.teamAScore < injury.teamBScore);
});

test('key suspension reduces discipline availability score', () => {
  const result = calculateMatchPrediction(baseInput({
    teamBData: {
      squadStatus: {
        injuredPlayers: [],
        doubtfulPlayers: [],
        suspendedPlayers: [{ name: 'Playmaker', importance: 'key' }],
        unavailablePlayers: [],
      },
    },
  }));
  const discipline = result.breakdown.find((row) => row.id === 'disciplineAvailability');
  assert.ok(discipline.teamBScore < discipline.teamAScore);
});

test('very close totals produce close match and extra-time risk', () => {
  const result = calculateMatchPrediction(baseInput({
    teamBData: {
      fifaRank: 8,
      gdpPerCapita: 30000,
      population: 50000000,
      footballCultureScore: 1,
      averageTemperature: 15,
      tournamentStats: {
        matchesPlayed: 3,
        wins: 2,
        draws: 1,
        losses: 0,
        goalsFor: 6,
        goalsAgainst: 2,
        goalDifference: 4,
        xG: 5.8,
        shots: 42,
        shotsOnTarget: 17,
        possession: 55,
        cleanSheets: 1,
        yellowCards: 3,
        redCards: 0,
      },
      playerRatings: { averageRating: 7.5, keyPlayers: [{ rating: 8, importance: 'key' }] },
      mentalProfile: {
        knockoutExperience: 4,
        comebackRecord: 3,
        lateGoals: 3,
        penaltyRecord: 3,
        seniorLeadership: 4,
        recentMomentum: 4,
      },
    },
  }));
  assert.equal(result.prediction.isCloseMatch, true);
  assert.equal(result.prediction.extraTimeRisk, true);
});

test('preserves manual data provenance in dataQuality', () => {
  const result = calculateMatchPrediction({
    ...baseInput(),
    manualSources: [{ path: 'teamAData.squadStatus', sources: [{ label: 'Official injury report' }] }],
    ignoredManualFields: [{ path: 'teamBData.mentalProfile', reason: 'missing source' }],
  });

  assert.equal(result.dataQuality.manualSources.length, 1);
  assert.equal(result.dataQuality.ignoredManualFields.length, 1);
});
