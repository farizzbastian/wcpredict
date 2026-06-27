'use strict';

/**
 * Group Situation Engine
 * Membaca status grup dan menentukan motivasi tim.
 * Memberikan skor situasi grup (0-1) dan dampak terhadap prediksi.
 *
 * status: must_win | draw_enough | already_qualified | already_eliminated
 */

const STATUS_LABELS = {
  must_win:            'Wajib Menang',
  draw_enough:         'Cukup Imbang',
  already_qualified:   'Sudah Lolos',
  already_eliminated:  'Sudah Gugur',
};

const STATUS_IMPACT = {
  must_win: {
    attackBoost:   true,
    defenseRisk:   true,
    rotationRisk:  false,
    confidenceMod: 0,
    description:   'Tim cenderung menyerang lebih agresif. Risiko kebobolan juga naik — pertandingan lebih terbuka.',
  },
  draw_enough: {
    attackBoost:   false,
    defenseRisk:   false,
    rotationRisk:  false,
    confidenceMod: 0,
    description:   'Tim cenderung bermain aman dan menjaga hasil imbang. Tempo bisa lebih rendah.',
  },
  already_qualified: {
    attackBoost:   false,
    defenseRisk:   false,
    rotationRisk:  true,
    confidenceMod: -5,
    description:   'Tim mungkin merotasi pemain kunci. Kekuatan starting XI harus dicek ulang.',
  },
  already_eliminated: {
    attackBoost:   false,
    defenseRisk:   false,
    rotationRisk:  true,
    confidenceMod: -8,
    description:   'Motivasi bisa turun, tetapi bisa pula bermain bebas tanpa tekanan. Tingkat keyakinan prediksi diturunkan.',
  },
};

/**
 * @param {string} teamNameA
 * @param {string} teamNameB
 * @param {string} group - 'Group D', dll
 * @param {object} groupStandings - data dari groupStandings.js
 * @returns {object}
 */
function analyzeGroupSituation(teamNameA, teamNameB, group, groupStandings) {
  const noGroupData = !group || !groupStandings || !groupStandings[group];

  const getTeamStanding = (teamName) => {
    if (noGroupData) return null;
    return groupStandings[group].find(t => t.team === teamName) || null;
  };

  const standingA = getTeamStanding(teamNameA);
  const standingB = getTeamStanding(teamNameB);

  const buildSide = (standing, teamName) => {
    if (!standing) {
      return {
        team: teamName,
        position: null, pts: null,
        status: null,
        motivation: 'Data tidak tersedia',
        impact: STATUS_IMPACT['draw_enough'],
        dataStatus: 'missing',
      };
    }
    return {
      team: teamName,
      position: standing.position,
      pts: standing.pts,
      status: standing.status,
      motivation: STATUS_LABELS[standing.status] || standing.status,
      impact: STATUS_IMPACT[standing.status] || STATUS_IMPACT['draw_enough'],
      dataStatus: 'available',
    };
  };

  const sideA = buildSide(standingA, teamNameA);
  const sideB = buildSide(standingB, teamNameB);

  // Skor situasi grup (0-1):
  // Tim "wajib menang" mendapat +1 karena motivasi lebih tinggi
  // Tim "sudah lolos" kehilangan keunggulan motivasi
  let scoreA = 0;
  let scoreB = 0;

  const motivationScore = (status) => {
    if (status === 'must_win')           return 2;
    if (status === 'draw_enough')        return 1;
    if (status === 'already_qualified')  return 0.5;
    if (status === 'already_eliminated') return 0;
    return 1;
  };

  const mA = standingA ? motivationScore(standingA.status) : 1;
  const mB = standingB ? motivationScore(standingB.status) : 1;

  if (mA > mB) scoreA = 1;
  else if (mB > mA) scoreB = 1;
  // else 0-0 (seimbang)

  return {
    sideA, sideB,
    scoreA, scoreB, maxScore: 1,
    dataStatus: noGroupData ? 'missing' : 'available',
  };
}

module.exports = { analyzeGroupSituation };
