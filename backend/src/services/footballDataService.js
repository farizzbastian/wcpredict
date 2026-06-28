'use strict';

/**
 * Football-Data.org Service
 * Mengambil data real FIFA World Cup 2026 dari API resmi.
 * API key dibaca dari FOOTBALL_DATA_API_KEY di .env.
 * Docs: https://www.football-data.org/documentation/quickstart
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL  = 'api.football-data.org';
const WC_CODE   = 'WC';
const DISK_CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'cache');

// ---- Cache sederhana in-memory agar tidak boros request ----
const cache = new Map();
const inflight = new Map();
const CACHE_TTL = {
  matches:   2 * 60 * 1000,   // 2 menit
  standings: 5 * 60 * 1000,   // 5 menit
  match:     1 * 60 * 1000,   // 1 menit
};

function fromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { cache.delete(key); return null; }
  return entry.data;
}
function toCache(key, data, ttl) {
  cache.set(key, { data, ts: Date.now(), ttl });
}

function diskCachePath(key) {
  return path.join(DISK_CACHE_DIR, `${key}.json`);
}

function toDiskCache(key, data) {
  try {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
    fs.writeFileSync(diskCachePath(key), JSON.stringify({
      cachedAt: new Date().toISOString(),
      data,
    }, null, 2));
  } catch (err) {
    console.warn(`Gagal menyimpan cache ${key}: ${err.message}`);
  }
}

function fromDiskCache(key) {
  try {
    const file = diskCachePath(key);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      cachedAt: parsed.cachedAt,
      data: parsed.data,
    };
  } catch (err) {
    console.warn(`Gagal membaca cache ${key}: ${err.message}`);
    return null;
  }
}

function markStaleMatches(matches, cachedAt) {
  return matches.map((match) => ({
    ...match,
    dataStatus: 'stale',
    dataSource: 'disk-cache',
    cacheUpdatedAt: cachedAt,
  }));
}

function markStaleStandings(standings, cachedAt) {
  return Object.fromEntries(Object.entries(standings).map(([group, rows]) => [
    group,
    rows.map((row) => ({
      ...row,
      dataStatus: 'stale',
      cacheUpdatedAt: cachedAt,
      stats: row.stats ? {
        ...row.stats,
        dataStatus: row.stats.dataStatus === 'available' ? 'partial' : row.stats.dataStatus,
        cacheUpdatedAt: cachedAt,
      } : row.stats,
    })),
  ]));
}

function mergeTeamSideFromCache(current, cached, side) {
  const tlaKey = side === 'A' ? 'tlaA' : 'tlaB';
  if (current[tlaKey] || !cached?.[tlaKey]) return current;

  const fields = side === 'A'
    ? ['teamA', 'flagA', 'tlaA', 'crestA', 'rankA']
    : ['teamB', 'flagB', 'tlaB', 'crestB', 'rankB'];

  return fields.reduce((merged, field) => ({
    ...merged,
    [field]: cached[field],
  }), current);
}

function mergeWithRicherDiskMatches(matches) {
  const stale = fromDiskCache('matches_all');
  if (!stale?.data?.length) return matches;

  const cachedById = new Map(stale.data.map((match) => [String(match.id), match]));
  return matches.map((match) => {
    const cached = cachedById.get(String(match.id));
    if (!cached) return match;

    let merged = mergeTeamSideFromCache(match, cached, 'A');
    merged = mergeTeamSideFromCache(merged, cached, 'B');

    return merged;
  });
}

// ---- Core fetch ----
function getApiKey() {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    const err = new Error('FOOTBALL_DATA_API_KEY belum diatur. Data pertandingan tidak bisa diperbarui dari provider.');
    err.status = 503;
    err.code = 'PROVIDER_KEY_MISSING';
    err.dataStatus = 'missing';
    throw err;
  }
  return key;
}

function parseProviderMessage(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.message || parsed.error || body;
  } catch {
    return body;
  }
}

function providerError(statusCode, body) {
  const providerMessage = parseProviderMessage(body);
  const err = new Error(`Football data provider error ${statusCode}: ${providerMessage}`);
  err.status = statusCode === 429 ? 429 : 503;
  err.code = statusCode === 401 || statusCode === 403
    ? 'PROVIDER_AUTH_FAILED'
    : statusCode === 429
    ? 'PROVIDER_RATE_LIMIT'
    : 'PROVIDER_UNAVAILABLE';
  err.providerStatusCode = statusCode;
  err.dataStatus = 'missing';
  return err;
}

function apiGet(path) {
  const pending = inflight.get(path);
  if (pending) return pending;

  const request = new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path,
      method:  'GET',
      headers: { 'X-Auth-Token': getApiKey() },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(providerError(res.statusCode, body));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON dari API')); }
      });
    });
    req.on('error', reject);
    req.end();
  });

  inflight.set(path, request);
  request.then(
    () => inflight.delete(path),
    () => inflight.delete(path)
  );
  return request;
}

// =============================================
//  FLAG EMOJI per kode tim
// =============================================
const FLAGS = {
  MEX:'🇲🇽', RSA:'🇿🇦', KOR:'🇰🇷', CZE:'🇨🇿',
  SUI:'🇨🇭', CAN:'🇨🇦', BIH:'🇧🇦', QAT:'🇶🇦',
  BRA:'🇧🇷', MAR:'🇲🇦', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', HAI:'🇭🇹',
  USA:'🇺🇸', AUS:'🇦🇺', PAR:'🇵🇾', TUR:'🇹🇷',
  GER:'🇩🇪', CIV:'🇨🇮', ECU:'🇪🇨', CUW:'🇨🇼',
  NED:'🇳🇱', JPN:'🇯🇵', SWE:'🇸🇪', TUN:'🇹🇳',
  BEL:'🇧🇪', EGY:'🇪🇬', IRN:'🇮🇷', NZL:'🇳🇿',
  ESP:'🇪🇸', CPV:'🇨🇻', URU:'🇺🇾', KSA:'🇸🇦',
  FRA:'🇫🇷', NOR:'🇳🇴', SEN:'🇸🇳', IRQ:'🇮🇶',
  ARG:'🇦🇷', AUT:'🇦🇹', ALG:'🇩🇿', JOR:'🇯🇴',
  COL:'🇨🇴', POR:'🇵🇹', COD:'🇨🇩', UZB:'🇺🇿',
  ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', GHA:'🇬🇭', CRO:'🇭🇷', PAN:'🇵🇦',
  // extras
  POL:'🇵🇱', ITA:'🇮🇹', DEN:'🇩🇰', PER:'🇵🇪',
  CHI:'🇨🇱', BOL:'🇧🇴', SRB:'🇷🇸', UKR:'🇺🇦',
  VEN:'🇻🇪', NGA:'🇳🇬',
};

function getFlag(tla) {
  return FLAGS[tla] || '🏳️';
}

// FIFA ranking lookup (statis — FIFA tidak update realtime via free API)
const FIFA_RANK = {
  ARG:1, FRA:2, ENG:4, BRA:5, BEL:5, POR:6, ESP:7, NED:8,
  ITA:10, GER:12, MAR:13, COL:14, URU:17, JPN:18, SUI:19,
  SEN:20, POL:21, AUS:23, AUT:24, KOR:25, CHI:26, TUR:28,
  CIV:29, TUN:30, SRB:33, CZE:37, ECU:40, USA:11, MEX:16,
  GHA:66, NOR:50, ALG:52, EGY:36, BIH:60, CAN:38, IRN:23,
  NZL:98, HAI:120, QAT:57, IRQ:70, JOR:90, UZB:80,
  SCO:38, SWE:27, CPV:85, SAU:57, COD:55, PAN:75,
  RSA:60, CUW:130, BOL:85, NGA:39, VEN:56, UKR:22,
  PER:35, GHA:66,
};

// GDP per kapita (USD, statis)
const GDP = {
  ARG:13700, FRA:43000, ENG:46000, BRA:8800, BEL:47000,
  POR:28000, ESP:30000, NED:52000, ITA:32000, GER:48000,
  MAR:3400,  COL:6800,  URU:17000, JPN:33800, SUI:87000,
  SEN:1600,  AUS:55000, AUT:49000, KOR:31000, TUR:10600,
  CIV:2400,  ECU:6200,  USA:63000, MEX:10000, GHA:2300,
  NOR:89000, ALG:3900,  EGY:3700,  BIH:6500,  CAN:52000,
  IRN:5200,  NZL:42000, HAI:1200,  QAT:62000, IRQ:5400,
  JOR:4300,  UZB:2200,  SCO:39000, SWE:55000, CPV:3600,
  KSA:24000, COD:550,   PAN:14000, RSA:6500,  CUW:17000,
  PER:7000,  NGA:2100,
};

// Populasi & budaya sepak bola
const POP_CULTURE = {
  ARG:{pop:45400000,  fc:10}, FRA:{pop:67500000,  fc:9},
  ENG:{pop:56000000,  fc:9},  BRA:{pop:215000000, fc:10},
  BEL:{pop:11600000,  fc:9},  POR:{pop:10300000,  fc:9},
  ESP:{pop:47400000,  fc:10}, NED:{pop:17500000,  fc:9},
  ITA:{pop:59500000,  fc:10}, GER:{pop:83200000,  fc:9},
  MAR:{pop:37500000,  fc:7},  COL:{pop:51500000,  fc:8},
  URU:{pop:3500000,   fc:9},  JPN:{pop:125700000, fc:7},
  SUI:{pop:8700000,   fc:7},  SEN:{pop:17600000,  fc:8},
  AUS:{pop:26000000,  fc:6},  AUT:{pop:9100000,   fc:7},
  KOR:{pop:51700000,  fc:7},  TUR:{pop:85000000,  fc:8},
  CIV:{pop:27000000,  fc:7},  ECU:{pop:18000000,  fc:7},
  USA:{pop:331000000, fc:6,   isHost:true},
  MEX:{pop:130000000, fc:8,   isHost:true},
  CAN:{pop:38200000,  fc:5,   isHost:true},
  GHA:{pop:32400000,  fc:7},  NOR:{pop:5400000,   fc:6},
  ALG:{pop:44900000,  fc:7},  EGY:{pop:104000000, fc:7},
  BIH:{pop:3200000,   fc:7},  IRN:{pop:87000000,  fc:7},
  NZL:{pop:5100000,   fc:5},  HAI:{pop:11500000,  fc:6},
  QAT:{pop:2900000,   fc:5},  IRQ:{pop:41200000,  fc:6},
  JOR:{pop:10200000,  fc:5},  UZB:{pop:35300000,  fc:5},
  SCO:{pop:5500000,   fc:8},  SWE:{pop:10400000,  fc:7},
  CPV:{pop:600000,    fc:7},  KSA:{pop:35000000,  fc:6},
  COD:{pop:100000000, fc:6},  PAN:{pop:4400000,   fc:6},
  RSA:{pop:60000000,  fc:7},  CUW:{pop:150000,    fc:5},
  PER:{pop:33200000,  fc:8},  NGA:{pop:218000000, fc:7},
};

// Suhu rata-rata negara (°C)
const AVG_TEMP = {
  ARG:18, FRA:12, ENG:11, BRA:25, BEL:10, POR:16, ESP:15, NED:10,
  ITA:14, GER:10, MAR:22, COL:24, URU:17, JPN:15, SUI:9,  SEN:29,
  AUS:22, AUT:8,  KOR:12, TUR:14, CIV:27, ECU:22, USA:13, MEX:20,
  GHA:27, NOR:2,  ALG:23, EGY:22, BIH:11, CAN:3,  IRN:17, NZL:13,
  HAI:27, QAT:32, IRQ:22, JOR:18, UZB:13, SCO:9,  SWE:6,  CPV:25,
  KSA:32, COD:25, PAN:27, RSA:18, CUW:28, PER:20, NGA:27,
};

// =============================================
//  PUBLIC FUNCTIONS
// =============================================

/** Ambil semua matches WC 2026 */
async function getMatches(filters = {}) {
  const cacheKey = 'matches_all';
  const cached = fromCache(cacheKey);
  if (cached) return applyFilters(cached, filters);

  try {
    const data = await apiGet(`/v4/competitions/${WC_CODE}/matches`);
    const mapped = mergeWithRicherDiskMatches(data.matches.map(mapMatch));
    toCache(cacheKey, mapped, CACHE_TTL.matches);
    toDiskCache(cacheKey, mapped);
    return applyFilters(mapped, filters);
  } catch (err) {
    const stale = fromDiskCache(cacheKey);
    if (!stale) throw err;
    const mapped = markStaleMatches(stale.data, stale.cachedAt);
    toCache(cacheKey, mapped, CACHE_TTL.matches);
    return applyFilters(mapped, filters);
  }
}

/** Ambil satu match by ID */
async function getMatchById(id) {
  const normalizedId = String(id);
  const cacheKey = `match_${id}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const cachedMatches = fromCache('matches_all');
  if (cachedMatches) {
    const match = cachedMatches.find((m) => m.id === normalizedId);
    if (match) {
      toCache(cacheKey, match, CACHE_TTL.match);
      return match;
    }
  }

  const matches = await getMatches();
  const fromList = matches.find((m) => m.id === normalizedId);
  if (fromList) {
    toCache(cacheKey, fromList, CACHE_TTL.match);
    return fromList;
  }

  const data = await apiGet(`/v4/matches/${id}`);
  const mapped = mapMatch(data);
  toCache(cacheKey, mapped, CACHE_TTL.match);
  return mapped;
}

/** Ambil standings semua grup */
async function getStandings() {
  const cacheKey = 'standings';
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiGet(`/v4/competitions/${WC_CODE}/standings`);
    const mapped = enrichStandingsWithDerivedStats(
      mapStandings(data.standings),
      await getMatches()
    );
    toCache(cacheKey, mapped, CACHE_TTL.standings);
    toDiskCache(cacheKey, mapped);
    return mapped;
  } catch (err) {
    const stale = fromDiskCache(cacheKey);
    if (!stale) throw err;
    const mapped = markStaleStandings(stale.data, stale.cachedAt);
    toCache(cacheKey, mapped, CACHE_TTL.standings);
    return mapped;
  }
}

/** Ambil standings satu grup */
async function getGroupStanding(groupName) {
  const all = await getStandings();
  return all[groupName] || null;
}

/** Bangun data tim dari TLA */
function getTeamData(tla) {
  if (!tla) return null;
  const pc = POP_CULTURE[tla] || { pop: 10000000, fc: 6 };
  return {
    tla,
    fifaRank:            FIFA_RANK[tla]   || 80,
    gdpPerCapita:        GDP[tla]         || 5000,
    population:          pc.pop,
    footballCultureScore:pc.fc,
    avgTemperature:      AVG_TEMP[tla]    || 18,
    isHost:              pc.isHost        || false,
  };
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function emptyDerivedStats() {
  return {
    matches: 0,
    xg: 0,
    shots: 0,
    shotsOnTarget: 0,
    possessionTotal: 0,
    yellowCards: 0,
    redCards: 0,
    form: [],
  };
}

function addDerivedMatchStats(bucket, { gf, ga, teamRank, oppRank }) {
  const rankEdge = clamp((oppRank - teamRank) / 50, -1, 1);
  const goalDiff = gf - ga;
  const xg = clamp(0.55 + (gf * 0.55) + (rankEdge * 0.28) - (ga * 0.06), 0.25, 3.4);
  const shots = Math.round(clamp(7 + (xg * 3.8) + (gf * 1.2) + (rankEdge * 2.2) - (ga * 0.4), 4, 25));
  const shotsOnTarget = Math.round(clamp(gf + (xg * 1.35) + (rankEdge * 0.7), 1, Math.min(shots, 12)));
  const possession = clamp(50 + (rankEdge * 8) + (goalDiff * 1.8), 35, 68);
  const yellowCards = Math.round(clamp(1.3 + (Math.max(0, -rankEdge) * 1.1) + (ga * 0.32) + (goalDiff < 0 ? 0.45 : 0), 0, 5));
  const redCards = yellowCards >= 5 && goalDiff < 0 ? 1 : 0;

  bucket.matches += 1;
  bucket.xg += xg;
  bucket.shots += shots;
  bucket.shotsOnTarget += shotsOnTarget;
  bucket.possessionTotal += possession;
  bucket.yellowCards += yellowCards;
  bucket.redCards += redCards;
  bucket.form.push(gf > ga ? 'W' : gf === ga ? 'D' : 'L');
}

function buildDerivedStatsByTeam(matches) {
  const byTeam = new Map();
  const ensure = (tla) => {
    if (!byTeam.has(tla)) byTeam.set(tla, emptyDerivedStats());
    return byTeam.get(tla);
  };

  matches
    .filter((match) => match.status === 'finished' && match.liveScore && match.tlaA && match.tlaB)
    .forEach((match) => {
      addDerivedMatchStats(ensure(match.tlaA), {
        gf: match.liveScore.a,
        ga: match.liveScore.b,
        teamRank: match.rankA || 80,
        oppRank: match.rankB || 80,
      });
      addDerivedMatchStats(ensure(match.tlaB), {
        gf: match.liveScore.b,
        ga: match.liveScore.a,
        teamRank: match.rankB || 80,
        oppRank: match.rankA || 80,
      });
    });

  return byTeam;
}

function mergeDerivedStats(stats, derived) {
  if (!derived || derived.matches === 0) return stats;
  const possessionAvg = derived.possessionTotal / derived.matches;
  return {
    ...stats,
    dataStatus: 'derived',
    advancedStatsAvailable: true,
    advancedStatsSource: 'derived_from_wc2026_match_results',
    xg: round(derived.xg, 1),
    shots: derived.shots,
    shotsOnTarget: derived.shotsOnTarget,
    possessionAvg: round(possessionAvg, 1),
    yellowCards: derived.yellowCards,
    redCards: derived.redCards,
    suspensions: derived.redCards + Math.floor(derived.yellowCards / 6),
    form: derived.form.slice(-5),
    averages: {
      xgPerMatch: round(derived.xg / derived.matches, 2),
      shotsPerMatch: round(derived.shots / derived.matches, 1),
      shotsOnTargetPerMatch: round(derived.shotsOnTarget / derived.matches, 1),
      yellowCardsPerMatch: round(derived.yellowCards / derived.matches, 1),
    },
  };
}

function enrichStandingsWithDerivedStats(standings, matches) {
  const derivedByTeam = buildDerivedStatsByTeam(matches);
  return Object.fromEntries(Object.entries(standings).map(([groupName, rows]) => [
    groupName,
    rows.map((row) => ({
      ...row,
      stats: mergeDerivedStats(row.stats, derivedByTeam.get(row.tla)),
    })),
  ]));
}

/** Ambil statistik turnamen tim dari standings */
async function getTeamTournamentStats(teamName) {
  const all = await getStandings();
  for (const group of Object.values(all)) {
    const entry = group.find(t => t.team === teamName);
    if (entry) return entry.stats;
  }
  return null;
}

// =============================================
//  MAPPERS
// =============================================

function mapMatch(m) {
  const statusMap = {
    FINISHED: 'finished',
    IN_PLAY:  'live',
    PAUSED:   'live',
    TIMED:    'upcoming',
    SCHEDULED:'upcoming',
    POSTPONED:'upcoming',
  };

  const home = m.homeTeam || {};
  const away = m.awayTeam || {};
  const score = m.score   || {};
  const ft    = score.fullTime || {};

  const isLive    = ['IN_PLAY','PAUSED'].includes(m.status);
  const isFinished = m.status === 'FINISHED';

  let liveScore = null;
  if (isLive || isFinished) {
    liveScore = {
      a: ft.home ?? 0,
      b: ft.away ?? 0,
      minute: isLive ? (m.minute || null) : 90,
    };
  }

  // Konversi grup dari "GROUP_A" → "Group A"
  const group = m.group
    ? 'Group ' + m.group.replace('GROUP_', '')
    : null;

  // Stage mapping
  const stageMap = {
    GROUP_STAGE:        'Group Stage',
    LAST_32:            'Round of 32',
    LAST_16:            'Round of 16',
    QUARTER_FINALS:     'Quarter Final',
    SEMI_FINALS:        'Semi Final',
    THIRD_PLACE:        'Third Place',
    FINAL:              'Final',
  };

  return {
    id:       String(m.id),
    teamA:    home.shortName || home.name || 'TBD',
    teamB:    away.shortName || away.name || 'TBD',
    flagA:    getFlag(home.tla),
    flagB:    getFlag(away.tla),
    tlaA:     home.tla,
    tlaB:     away.tla,
    crestA:   home.crest || null,
    crestB:   away.crest || null,
    rankA:    FIFA_RANK[home.tla] || 99,
    rankB:    FIFA_RANK[away.tla] || 99,
    date:     m.utcDate ? m.utcDate.substring(0, 10) : null,
    time:     m.utcDate ? m.utcDate.substring(11, 16) : null,
    stadium:  m.venue   || null,
    city:     null,
    phase:    stageMap[m.stage] || m.stage || 'Unknown',
    group:    group,
    status:   statusMap[m.status] || 'upcoming',
    liveScore,
    matchday: m.matchday,
    rawStatus:m.status,
  };
}

function mapStandings(standings) {
  const result = {};
  for (const s of standings) {
    const groupName = s.group || 'Unknown';
    result[groupName] = s.table.map(row => ({
      position: row.position,
      team:     row.team.shortName || row.team.name,
      tla:      row.team.tla,
      pts:      row.points,
      played:   row.playedGames,
      won:      row.won,
      drawn:    row.draw,
      lost:     row.lost,
      gf:       row.goalsFor,
      ga:       row.goalsAgainst,
      gd:       row.goalDifference,
      status:   deriveStatus(row),
      stats: {
        dataStatus: 'partial',
        advancedStatsAvailable: false,
        matchesPlayed: row.playedGames,
        wins:  row.won,
        draws: row.draw,
        losses: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff: row.goalDifference,
        // Nilai berikut tidak tersedia di endpoint standings, diisi 0
        xg: 0, shots: 0, shotsOnTarget: 0,
        possessionAvg: 50,
        yellowCards: 0, redCards: 0, suspensions: 0,
        form: [],
      },
    }));
  }
  return result;
}

function deriveStatus(row) {
  // Heuristik berdasarkan poin dan posisi
  if (row.position <= 2 && row.playedGames === 3) return 'already_qualified';
  if (row.position === 4 && row.playedGames === 3) return 'already_eliminated';
  if (row.points === 0 && row.playedGames >= 2)    return 'must_win';
  if (row.position <= 2)                           return 'draw_enough';
  return 'normal';
}

function applyFilters(list, { status, phase, group } = {}) {
  let r = list;
  if (status && status !== 'all') r = r.filter(m => m.status === status);
  if (phase)  r = r.filter(m => m.phase === phase);
  if (group)  r = r.filter(m => m.group === group);
  return r;
}

module.exports = {
  getMatches, getMatchById, getStandings,
  getGroupStanding, getTeamData, getTeamTournamentStats,
};
