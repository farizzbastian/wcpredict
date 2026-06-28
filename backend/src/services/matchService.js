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

/** Update live score manual di cache runtime */
async function updateLiveScore(id, scoreA, scoreB, minute) {
  return fd.updateLiveScore(id, scoreA, scoreB, minute);
}

module.exports = { getAllMatches, getMatchById, updateLiveScore };
