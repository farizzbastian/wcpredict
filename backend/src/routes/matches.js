'use strict';

const express = require('express');
const router  = express.Router();
const matchService = require('../services/matchService');
const { query, param, body, validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success:false, error:{ code:400, message:'Validasi gagal.', details:errors.array() } });
  next();
}

/** GET /api/matches */
router.get('/',
  query('status').optional().isIn(['all','upcoming','live','finished']),
  query('phase').optional().isString(),
  query('group').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      const matches = await matchService.getAllMatches(req.query);
      res.json({ success:true, count:matches.length, data:matches });
    } catch (err) { next(err); }
  }
);

/** GET /api/matches/:id */
router.get('/:id',
  param('id').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const match = await matchService.getMatchById(req.params.id);
      if (!match) return res.status(404).json({ success:false, error:{ code:404, message:'Pertandingan tidak ditemukan.' } });
      res.json({ success:true, data:match });
    } catch (err) { next(err); }
  }
);

/** PATCH /api/matches/:id/live-score — update manual */
router.patch('/:id/live-score',
  param('id').isString().notEmpty(),
  body('scoreA').isInt({ min:0 }),
  body('scoreB').isInt({ min:0 }),
  body('minute').isInt({ min:1, max:120 }),
  validate,
  async (req, res, next) => {
    try {
      const updated = await matchService.updateLiveScore(req.params.id, req.body.scoreA, req.body.scoreB, req.body.minute);
      res.json({ success:true, message:'Live score diperbarui.', data:updated });
    } catch (err) { next(err); }
  }
);

module.exports = router;
