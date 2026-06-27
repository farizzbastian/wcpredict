'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const matchRoutes      = require('./routes/matches');
const predictionRoutes = require('./routes/predictions');
const teamRoutes       = require('./routes/teams');

const app = express();
const frontendDir = path.resolve(__dirname, '..', '..', 'frontend');

// ---- Middleware ----
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'PATCH', 'POST'],
}));
app.use(express.json());

// Log setiap request (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ---- Health Check ----
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'WC2026 Prediction Engine API — running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ---- Routes ----
app.use('/api/matches',     matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/teams',       teamRoutes);

// ---- Frontend static files ----
app.use(express.static(frontendDir));

// ---- Error Handling ----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
