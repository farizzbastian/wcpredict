'use strict';

const express = require('express');
const router = express.Router();
const fd = require('../services/footballDataService');

/** GET /api/teams - semua tim dari standings */
router.get('/', async (req, res, next) => {
  try {
    const standings = await fd.getStandings();
    const teams = [];
    for (const [group, rows] of Object.entries(standings)) {
      for (const row of rows) {
        const td = fd.getTeamData(row.tla);
        teams.push({
          name: row.team,
          tla: row.tla,
          group,
          fifaRank: td?.fifaRank || 99,
          isHost: td?.isHost || false,
        });
      }
    }
    res.json({ success: true, count: teams.length, data: teams });
  } catch (err) {
    next(err);
  }
});

/** GET /api/teams/standings/all - semua grup */
router.get('/standings/all', async (req, res, next) => {
  try {
    const standings = await fd.getStandings();
    res.json({ success: true, data: standings });
  } catch (err) {
    next(err);
  }
});

/** GET /api/teams/:tla - detail tim */
router.get('/:tla', async (req, res, next) => {
  try {
    const tla = req.params.tla.toUpperCase();
    const td = fd.getTeamData(tla);
    const standings = await fd.getStandings();
    let standing = null;

    for (const rows of Object.values(standings)) {
      const row = rows.find((x) => x.tla === tla);
      if (row) {
        standing = row;
        break;
      }
    }

    if (!standing && !td) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: `Tim ${tla} tidak ditemukan.` },
      });
    }

    res.json({ success: true, data: { team: td, standing } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
