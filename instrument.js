'use strict';

/**
 * @file instrument.js
 * @description Inicialización temprana de Sentry según la documentación oficial de Sentry.
 * Permite instrumentar la aplicación antes de que cualquier otro módulo sea cargado.
 */

const Sentry = require('@sentry/node');

const dsn = process.env.SENTRY_DSN || 'https://7d6d16733bf60dea9e9dad83f12cf36a@o4512377375490048.ingest.us.sentry.io/4512377507610624';

Sentry.init({
  dsn: dsn,
  tracesSampleRate: 1.0,
  environment: process.env.VERCEL ? 'vercel-production' : (process.env.NODE_ENV || 'development'),
});

console.log('[Sentry] SDK inicializado correctamente desde instrument.js');

module.exports = Sentry;
