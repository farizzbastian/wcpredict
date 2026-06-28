'use strict';

const fs = require('fs');
const path = require('path');

const MANUAL_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'manual', 'predictionOverrides.json');

const TEAM_SECTION_KEYS = [
  'fifaRank',
  'gdpPerCapita',
  'population',
  'footballCultureScore',
  'averageTemperature',
  'tournamentStats',
  'squadStatus',
  'playerRatings',
  'mentalProfile',
];

const MATCH_SECTION_KEYS = [
  'venueCountry',
  'hostCountries',
  'tournamentCardRules',
];

function loadManualData() {
  if (!fs.existsSync(MANUAL_DATA_PATH)) {
    return { teams: {}, matches: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(MANUAL_DATA_PATH, 'utf8'));
  } catch (err) {
    return {
      teams: {},
      matches: {},
      _loadError: `Manual data tidak bisa dibaca: ${err.message}`,
    };
  }
}

function hasValidSource(value) {
  const sources = value?._sources;
  return Array.isArray(sources) && sources.some((source) => source?.url || source?.label);
}

function withoutMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const clean = { ...value };
  delete clean._sources;
  delete clean._notes;
  return clean;
}

function mergeObject(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  return {
    ...(base || {}),
    ...withoutMetadata(patch),
  };
}

function applySection({ target, key, value, pathName, sources, ignored }) {
  if (value == null) return;

  if (!hasValidSource(value)) {
    ignored.push({
      path: pathName,
      reason: 'Manual data diabaikan karena tidak memiliki _sources dengan label atau url.',
    });
    return;
  }

  const cleaned = Object.prototype.hasOwnProperty.call(value, 'value')
    ? value.value
    : withoutMetadata(value);
  target[key] = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.prototype.hasOwnProperty.call(value, 'value')
      ? cleaned
      : mergeObject(target[key], value)
    : cleaned;
  sources.push({
    path: pathName,
    sources: value._sources,
    notes: value._notes || null,
  });
}

function applyTeamOverrides(teamData, teamOverride, side, sources, ignored) {
  const result = { ...(teamData || {}) };
  if (!teamOverride) return result;

  TEAM_SECTION_KEYS.forEach((key) => {
    applySection({
      target: result,
      key,
      value: teamOverride[key],
      pathName: `${side}.${key}`,
      sources,
      ignored,
    });
  });

  return result;
}

function applyMatchOverrides(match, matchOverride, sources, ignored) {
  const result = { ...(match || {}) };
  if (!matchOverride) return result;

  MATCH_SECTION_KEYS.forEach((key) => {
    applySection({
      target: result,
      key,
      value: matchOverride[key],
      pathName: `match.${key}`,
      sources,
      ignored,
    });
  });

  return result;
}

function getTeamOverride(manualData, tla, countryName) {
  return manualData.teams?.[tla] || manualData.teams?.[countryName] || null;
}

function applyManualPredictionOverrides({ match, teamAData, teamBData, tlaA, tlaB }) {
  const manualData = loadManualData();
  const sources = [];
  const ignored = [];

  if (manualData._loadError) {
    ignored.push({ path: 'manualData', reason: manualData._loadError });
  }

  const matchOverride = manualData.matches?.[String(match.id)] || null;
  const teamAOverride = getTeamOverride(manualData, tlaA, teamAData?.country || teamAData?.name);
  const teamBOverride = getTeamOverride(manualData, tlaB, teamBData?.country || teamBData?.name);

  return {
    match: applyMatchOverrides(match, matchOverride, sources, ignored),
    teamAData: applyTeamOverrides(teamAData, teamAOverride, 'teamAData', sources, ignored),
    teamBData: applyTeamOverrides(teamBData, teamBOverride, 'teamBData', sources, ignored),
    manualSources: sources,
    ignoredManualFields: ignored,
  };
}

module.exports = {
  applyManualPredictionOverrides,
  MANUAL_DATA_PATH,
};
