/**
 * @file server.js
 * @description Servidor UNA Chat con soporte WebSocket (Socket.IO) y HTTP REST (Express).
 * Integra la librería de validación y sanitización unalib para prevenir inyecciones de scripts.
 */

'use strict';

require('./instrument');
require('dotenv').config();
require('./otel');
const Sentry = require('@sentry/node');

const express = require('express');
const { auth } = require('express-openid-connect');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const validation = require('./libs/unalib');
const { logInfo, logError } = require('./logger');

const port = process.env.PORT || 3000;

// Sanitizar CLIENT_SECRET si está vacío para evitar fallo de esquema en express-openid-connect
if (!process.env.CLIENT_SECRET || process.env.CLIENT_SECRET.trim() === '') {
  delete process.env.CLIENT_SECRET;
}

// Configuración de Auth0 Express OpenID Connect
const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SECRET || 'c7da15dbf5a1a9293a7194a5e2ea29b096001e0a2e32388fa677bbdf43d46f8a',
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  clientID: process.env.CLIENT_ID || 'aAgD2set6xwI5QDdISM5e46O51JV3FCL',
  issuerBaseURL: process.env.ISSUER_BASE_URL || 'https://dev-n4zx07h2zlhwtujm.us.auth0.com',
};

if (process.env.CLIENT_SECRET && process.env.CLIENT_SECRET.trim() !== '') {
  authConfig.clientSecret = process.env.CLIENT_SECRET.trim();
}

app.use(auth(authConfig));

// Middlewares para análisis de solicitudes HTTP
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta para registro con screen_hint en Auth0
app.get('/signup', (req, res) => {
  return res.oidc.login({
    returnTo: '/',
    authorizationParams: { screen_hint: 'signup' },
  });
});

// Endpoint para consultar estado de sesión OIDC en el servidor
app.get('/api/me', (req, res) => {
  if (req.oidc && req.oidc.isAuthenticated()) {
    return res.json({
      isAuthenticated: true,
      user: req.oidc.user,
    });
  }
  return res.json({
    isAuthenticated: false,
    user: null,
  });
});

// Ruta principal para servir la interfaz del chat
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

/**
 * Endpoint para proveer la configuración pública de Auth0 al cliente SPA.
 */
app.get('/api/auth-config', function (req, res) {
  return res.json({
    domain: process.env.AUTH0_DOMAIN || 'dev-n4zx07h2zlhwtujm.us.auth0.com',
    clientId: process.env.AUTH0_CLIENT_ID || 'zbbzSMgcBv7jloVq40qrHKAuAJX9SC9n'
  });
});

/**
 * Endpoint de prueba para provocar un fallo controlado y verificar Sentry y Grafana.
 */
app.get('/api/error-test', function (req, res) {
  const error = new Error('Error de prueba controlado para Sentry y Grafana - UNA Chat');
  logError('Fallo controlado generado para verificación de telemetría', error, { endpoint: '/api/error-test' });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
  return res.status(500).json({
    status: 'error',
    message: error.message,
    sentry: process.env.SENTRY_DSN ? 'evento_enviado' : 'sin_dsn_configurado'
  });
});

/**
 * Ruta HTTP POST para recepción y validación de mensajes.
 * Diseñada para pruebas de integración con Supertest.
 */
app.post('/api/mensaje', function (req, res) {
  try {
    const rawBody = req.body;
    logInfo('Procesando solicitud HTTP POST /api/mensaje', { endpoint: '/api/mensaje' });

    // Comprobar que backend invoca validarMensaje de unalib
    const sanitizedString = validation.validarMensaje(rawBody);
    const parsed = JSON.parse(sanitizedString);

    logInfo('Mensaje validado y sanitizado correctamente contra XSS', {
      user: parsed.nombre || 'anonimo',
      status: 'success'
    });

    // Emitir mensaje saneado a todos los clientes conectados por WebSocket
    io.emit('Evento-Mensaje-Server', sanitizedString);

    return res.status(200).json({
      status: 'success',
      data: parsed
    });
  } catch (error) {
    logError('Error al procesar mensaje HTTP', error, { endpoint: '/api/mensaje' });
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al procesar el mensaje'
    });
  }
});

// Configurar captura global de errores de Express con Sentry si está activo
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Manejo de conexiones y eventos de Socket.IO
io.on('connection', function (socket) {
  logInfo('Nueva conexión WebSocket de cliente establecida', { socket_id: socket.id });
  socket.on('Evento-Mensaje-Server', function (msg) {
    logInfo('Evento WebSocket Evento-Mensaje-Server recibido');
    // Validar y sanitizar a través de unalib.validarMensaje
    const validatedMsg = validation.validarMensaje(msg);
    io.emit('Evento-Mensaje-Server', validatedMsg);
  });
});

// Iniciar el servidor si se ejecuta como proceso principal
if (require.main === module) {
  http.listen(port, function () {
    console.log('Servidor UNA Chat escuchando en *:' + port);
  });
}

module.exports = { app, http, io };
