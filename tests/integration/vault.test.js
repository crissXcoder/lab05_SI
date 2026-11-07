/**
 * @file tests/integration/vault.test.js
 * @description Pruebas de integración para los endpoints de autenticación y módulo Supabase Vault.
 */

const request = require('supertest');
const { app } = require('../../server');
const { runStartupProbe } = require('../../server/vault');

describe('Pruebas de Integración: Endpoints de Autenticación y Supabase Vault', () => {
  describe('GET /auth/config', () => {
    it('debería responder 200 con enabled: true, dominio y clientId sin exponer el secret', async () => {
      const response = await request(app).get('/auth/config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled', true);
      expect(response.body).toHaveProperty('domain');
      expect(response.body).toHaveProperty('clientId');
      expect(response.body).not.toHaveProperty('clientSecret');
      expect(response.body).not.toHaveProperty('secret');
    });
  });

  describe('GET /sala', () => {
    it('debería responder 401 Unauthorized cuando no existe sesión activa', async () => {
      const response = await request(app).get('/sala');
      expect(response.status).toBe(401);
      expect(response.text).toContain('No autorizado');
    });
  });

  describe('GET /auth/login', () => {
    it('debería responder 302 redirigiendo hacia el dominio de Auth0', async () => {
      const response = await request(app).get('/auth/login');
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('auth0.com');
      expect(response.headers.location).toContain('redirect_uri=');
    });
  });

  describe('Módulo Vault - runStartupProbe', () => {
    it('debería manejar una prueba con credencial inválida retornando invalid_client o access_denied', async () => {
      const probeResult = await runStartupProbe({
        domain: 'dev-n4zx07h2zlhwtujm.us.auth0.com',
        clientId: 'aAgD2set6xwI5QDdISM5e46O51JV3FCL',
        clientSecret: 'secret_de_prueba_falso',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

      expect(probeResult).toHaveProperty('success', false);
      expect(['access_denied', 'invalid_client']).toContain(probeResult.error);
    });
  });
});

