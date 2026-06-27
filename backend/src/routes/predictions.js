'use strict';

const express = require('express');
const router  = express.Router();
const { param, validationResult } = require('express-validator');
const matchService      = require('../services/matchService');
const predictionService = require('../services/predictionService');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success:false, error:{ code:400, message:'Validasi gagal.', details:errors.array() } });
  next();
}

/** GET /api/predictions/:matchId — full prediction */
router.get('/:matchId',
  param('matchId').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const match = await matchService.getMatchById(req.params.matchId);
      if (!match) return res.status(404).json({ success:false, error:{ code:404, message:'Pertandingan tidak ditemukan.' } });
      const result = await predictionService.getPrediction(match);
      res.json({ success:true, dataStatus:result.prediction.dataStatus, lastUpdated:result.prediction.lastUpdated, data:result });
    } catch (err) { next(err); }
  }
);

/** GET /api/predictions/:matchId/summary — ringkasan untuk match card */
router.get('/:matchId/summary',
  param('matchId').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const match = await matchService.getMatchById(req.params.matchId);
      if (!match) return res.status(404).json({ success:false, error:{ code:404, message:'Pertandingan tidak ditemukan.' } });
      const result = await predictionService.getPrediction(match);
      const p = result.prediction;
      res.json({ success:true, data:{
        matchId:      match.id,
        teamA:        match.teamA,
        teamB:        match.teamB,
        confidence:   p.confidence,
        resultLabel:  p.resultLabel,
        predictedScore: p.predictedScore,
        dataStatus:   p.dataStatus,
        completeness: p.completeness,
        risk:         p.risk,
      }});
    } catch (err) { next(err); }
  }
);

module.exports = router;
