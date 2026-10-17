/**
 * @file chat.test.js
 * @description Pruebas de integración entre el backend Node.js (Express & Socket.IO) y una-lib.
 * Valida la recepción de mensajes HTTP y Socket.IO, invocación a validarMensaje,
 * procesamiento de imágenes y videos, y neutralización de inyecciones de scripts.
 */

const request = require('supertest');
const ioClient = require('socket.io-client');
const http = require('http');
const { app } = require('../../server');
const unalib = require('../../libs/unalib');

describe('Pruebas de Integración: Backend Node.js <-> una-lib', () => {
  let serverInstance;
  let socketServer;
  let socketClient;
  let serverPort;

  beforeAll((done) => {
    // Iniciar servidor temporal en puerto dinámico para pruebas de Socket.IO
    serverInstance = http.createServer(app);
    const { Server } = require('socket.io');
    socketServer = new Server(serverInstance);

    socketServer.on('connection', (socket) => {
      socket.on('Evento-Mensaje-Server', (msg) => {
        const validated = unalib.validarMensaje(msg);
        socketServer.emit('Evento-Mensaje-Server', validated);
      });
    });

    serverInstance.listen(0, () => {
      serverPort = serverInstance.address().port;
      socketClient = ioClient(`http://localhost:${serverPort}`);
      socketClient.on('connect', done);
    });
  });

  afterAll((done) => {
    if (socketClient && socketClient.connected) {
      socketClient.disconnect();
    }
    if (socketServer) {
      socketServer.close(() => {
        done();
      });
    } else if (serverInstance && serverInstance.listening) {
      serverInstance.close(done);
    } else {
      done();
    }
  });

  describe('1. Integración HTTP con Supertest (POST /api/mensaje)', () => {
    it('debería invocar a validarMensaje de unalib al procesar solicitudes HTTP', async () => {
      const spyValidar = jest.spyOn(unalib, 'validarMensaje');
      const payload = {
        nombre: 'Estudiante',
        mensaje: 'Mensaje de prueba de integración',
        color: '#2ecc71'
      };

      const response = await request(app)
        .post('/api/mensaje')
        .send(payload);

      expect(response.status).toBe(200);
      expect(spyValidar).toHaveBeenCalled();
      expect(response.body.data.nombre).toBe('Estudiante');
      expect(response.body.data.mensaje).toBe('Mensaje de prueba de integración');

      spyValidar.mockRestore();
    });

    it('debería aceptar y formatear una URL de imagen válida como etiqueta <img>', async () => {
      const payload = {
        nombre: 'Carlos',
        mensaje: 'https://images.unsplash.com/photo-1546768292-fb12f6c92568.png',
        color: '#3498db'
      };

      const response = await request(app)
        .post('/api/mensaje')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.data.tipo).toBe('imagen');
      expect(response.body.data.mensaje).toContain('<img src="https://images.unsplash.com/photo-1546768292-fb12f6c92568.png"');
      expect(response.body.data.mensaje).toContain('alt="Imagen compartida"');
    });

    it('debería aceptar y formatear una URL de video de YouTube válida como reproductor <iframe>', async () => {
      const payload = {
        nombre: 'Maria',
        mensaje: 'https://www.youtube.com/watch?v=qYwlqx-JLok',
        color: '#e74c3c'
      };

      const response = await request(app)
        .post('/api/mensaje')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.data.tipo).toBe('video');
      expect(response.body.data.mensaje).toContain('<iframe');
      expect(response.body.data.mensaje).toContain('https://www.youtube.com/embed/qYwlqx-JLok');
    });

    it('debería neutralizar y sanear cualquier intento de inyección de scripts (XSS)', async () => {
      const payload = {
        nombre: 'Hacker',
        mensaje: "<script>alert('Inyección de script');</script>",
        color: '#9b59b6'
      };

      const response = await request(app)
        .post('/api/mensaje')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.data.tipo).toBe('texto');
      // No debe contener tags ejecutables <script>
      expect(response.body.data.mensaje).not.toContain('<script>');
      expect(response.body.data.mensaje).not.toContain('</script>');
      // Debe contener entidades neutralizadas seguras
      expect(response.body.data.mensaje).toContain('&lt;script&gt;');
      expect(response.body.data.mensaje).toContain('&lt;/script&gt;');
    });
  });

  describe('2. Integración en tiempo real con Socket.IO (Evento-Mensaje-Server)', () => {
    it('debería procesar eventos de socket a través de una-lib y devolver el mensaje saneado', (done) => {
      const mensajeMalicioso = {
        nombre: 'SocketUser',
        mensaje: '<img src=x onerror=alert(document.cookie)>',
        color: '#1abc9c'
      };

      socketClient.once('Evento-Mensaje-Server', (data) => {
        const parsed = JSON.parse(data);
        expect(parsed.nombre).toBe('SocketUser');
        // El vector onerror debe estar neutralizado
        expect(parsed.mensaje).not.toContain('<img src=x onerror=');
        expect(parsed.mensaje).toContain('&lt;img');
        done();
      });

      socketClient.emit('Evento-Mensaje-Server', JSON.stringify(mensajeMalicioso));
    });
  });
});
