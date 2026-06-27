'use strict';

/**
 * Error handler middleware — mengembalikan response terstandar
 * Sesuai prinsip PRD: transparan, jangan sembunyikan status data.
 */

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan pada server.';

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${status}: ${message}`);
  if (process.env.NODE_ENV === 'development' && err.stack) {
    console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    error: {
      code: status,
      message,
      type: err.code || 'INTERNAL_ERROR',
      dataStatus: err.dataStatus || 'missing',
      providerStatusCode: err.providerStatusCode,
    },
  });
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 404,
      message: `Route ${req.method} ${req.path} tidak ditemukan.`,
    },
  });
}

module.exports = { errorHandler, notFound };
