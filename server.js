/**
 * @file server.js
 * @description Servidor UNA Chat con soporte WebSocket (Socket.IO) y HTTP REST (Express).
 * Integra la librería de validación y sanitización unalib para prevenir inyecciones de scripts.
 */

'use strict';

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const validation = require('./libs/unalib');

const port = process.env.PORT || 3000;

// Middlewares para análisis de solicitudes HTTP
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta principal para servir la interfaz del chat
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

/**
 * Ruta HTTP POST para recepción y validación de mensajes.
 * Diseñada para pruebas de integración con Supertest.
 */
app.post('/api/mensaje', function (req, res) {
  try {
    const rawBody = req.body;
    // Comprobar que backend invoca validarMensaje de unalib
    const sanitizedString = validation.validarMensaje(rawBody);
    const parsed = JSON.parse(sanitizedString);

    // Emitir mensaje saneado a todos los clientes conectados por WebSocket
    io.emit('Evento-Mensaje-Server', sanitizedString);

    return res.status(200).json({
      status: 'success',
      data: parsed
    });
  } catch (error) {
    console.error('Error al procesar mensaje HTTP:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al procesar el mensaje'
    });
  }
});

// Manejo de conexiones y eventos de Socket.IO
io.on('connection', function (socket) {
  socket.on('Evento-Mensaje-Server', function (msg) {
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
