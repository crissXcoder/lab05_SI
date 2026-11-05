'use strict';

/**
 * Entrypoint serverless para Vercel.
 * Inicializa instrument.js y exporta la instancia de Express de server.js.
 */
require('../instrument');
const { app } = require('../server');

module.exports = app;

