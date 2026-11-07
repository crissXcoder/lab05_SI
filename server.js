/**
 * @file server.js
 * @description Servidor UNA Chat con soporte WebSocket (Socket.IO), HTTP REST (Express),
 * autenticación Auth0 OIDC con secretos protegidos en Supabase Vault, telemetría y sanitización.
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
const { getClientSecretFromVault, runStartupProbe } = require('./server/vault');

const port = process.env.PORT || 3000;

// Variables de Auth0 (soporte para formato de laboratorio y compatibilidad OIDC)
const auth0Domain = (process.env.AUTH0_DOMAIN || 'dev-n4zx07h2zlhwtujm.us.auth0.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const auth0ClientId = process.env.AUTH0_CLIENT_ID || process.env.CLIENT_ID || 'aAgD2set6xwI5QDdISM5e46O51JV3FCL';
const appBaseUrl = (process.env.APP_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const issuerBaseURL = process.env.ISSUER_BASE_URL || `https://${auth0Domain}`;

// Sanitizar CLIENT_SECRET si está vacío para evitar fallo de validación en express-openid-connect
if (!process.env.CLIENT_SECRET || process.env.CLIENT_SECRET.trim() === '') {
  delete process.env.CLIENT_SECRET;
}

// Configuración base de Auth0 Express OpenID Connect
const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SECRET || 'c7da15dbf5a1a9293a7194a5e2ea29b096001e0a2e32388fa677bbdf43d46f8a',
  baseURL: appBaseUrl,
  clientID: auth0ClientId,
  issuerBaseURL: issuerBaseURL,
  routes: {
    login: false,
    callback: '/auth/callback',
    logout: false,
    postLogoutRedirect: '/',
  },
};

if (process.env.CLIENT_SECRET && process.env.CLIENT_SECRET.trim() !== '') {
  authConfig.clientSecret = process.env.CLIENT_SECRET.trim();
}

let authMiddleware = auth(authConfig);

// Middleware dinámico para soportar recarga de clientSecret desde Vault al arrancar
app.use((req, res, next) => {
  if (authMiddleware) {
    return authMiddleware(req, res, next);
  }
  next();
});

// Middlewares para análisis de solicitudes HTTP
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Endpoints de autenticación requeridos por el Laboratorio 8 y Auth0
 */

// GET /auth/config: 200 OK con flags públicos. El Client Secret nunca se expone.
app.get('/auth/config', function (req, res) {
  return res.status(200).json({
    enabled: true,
    domain: auth0Domain,
    clientId: auth0ClientId,
  });
});

// Endpoint compatible con el frontend existente
app.get('/api/auth-config', function (req, res) {
  return res.json({
    domain: auth0Domain,
    clientId: auth0ClientId,
  });
});

// GET /auth/login: Inicia el flujo OIDC y redirige a Auth0 Universal Login (302)
app.get('/auth/login', (req, res) => {
  return res.oidc.login({
    returnTo: '/sala',
  });
});

// GET /login: Redirección de conveniencia hacia /auth/login
app.get('/login', (req, res) => {
  return res.redirect('/auth/login');
});

// GET /auth/logout: Cierra sesión y redirige al inicio
app.get('/auth/logout', (req, res) => {
  return res.oidc.logout({
    returnTo: '/',
  });
});

// GET /logout: Redirección de conveniencia hacia /auth/logout
app.get('/logout', (req, res) => {
  return res.redirect('/auth/logout');
});

// GET /signup: Registro directo con screen_hint en Auth0
app.get('/signup', (req, res) => {
  return res.oidc.login({
    returnTo: '/sala',
    authorizationParams: { screen_hint: 'signup' },
  });
});

// GET /sala: Requiere autenticación. Responde 401 si no hay sesión abierta.
app.get('/sala', function (req, res) {
  if (req.oidc && req.oidc.isAuthenticated()) {
    return res.sendFile(__dirname + '/index.html');
  }
  return res.status(401).send('No autorizado. Debe iniciar sesión para ingresar a la sala.');
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

/**
 * Inicialización asíncrona del servidor con lectura de Supabase Vault y prueba de arranque Auth0
 */
async function startServer() {
  let activeSecret = authConfig.clientSecret || process.env.CLIENT_SECRET;

  if (process.env.VAULT_DATABASE_URL) {
    try {
      console.log('[Vault] Conectando a Supabase Vault para obtener el Client Secret de Auth0...');
      const secret = await getClientSecretFromVault(process.env.VAULT_DATABASE_URL);
      if (secret) {
        activeSecret = secret;
        authConfig.clientSecret = secret;
        authMiddleware = auth(authConfig);
        console.log(`[Vault] Secreto obtenido de Supabase Vault exitosamente (longitud: ${secret.length})`);
      }
    } catch (vaultError) {
      console.warn('[Vault] Aviso: No se pudo obtener el secreto desde Vault:', vaultError.message);
      if (activeSecret) {
        console.log('[Vault] Utilizando secreto provisto por variable de entorno');
      }
    }
  }

  // Ejecutar prueba de arranque si hay un secreto disponible
  if (activeSecret) {
    console.log('[Vault] Ejecutando prueba de arranque contra Auth0...');
    await runStartupProbe({
      domain: auth0Domain,
      clientId: auth0ClientId,
      clientSecret: activeSecret,
      redirectUri: `${appBaseUrl}/auth/callback`,
    });
  } else {
    console.log('[Vault] Servidor iniciando sin Client Secret activo (modo solo lectura)');
  }

  http.listen(port, function () {
    console.log('Servidor UNA Chat escuchando en *:' + port);
  });
}

// Iniciar el servidor si se ejecuta como proceso principal
if (require.main === module) {
  startServer();
}

module.exports = { app, http, io, startServer };
