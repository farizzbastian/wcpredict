'use strict';

const fd = require('./footballDataService');

/** GET semua matches dengan optional filter */
async function getAllMatches(filters = {}) {
  return fd.getMatches(filters);
}

/** GET satu match by ID */
async function getMatchById(id) {
  return fd.getMatchById(id);
}

/** Update live score — hanya in-memory cache override */
function updateLiveScore(id, scoreA, scoreB, minute) {
  // Tidak menulis ke file — hanya informasi manual saat API tidak update
  return { id, liveScore: { a: scoreA, b: scoreB, minute }, status: 'live' };
}

module.exports = { getAllMatches, getMatchById, updateLiveScore };
