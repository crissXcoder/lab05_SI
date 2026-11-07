'use strict';

/**
 * @file server/vault.js
 * @description Módulo de integración segura con Supabase Vault y prueba de arranque Auth0.
 * Conecta con el rol una_chat_backend para consultar una_chat_private.get_auth0_client_secret().
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

/**
 * Obtiene el Client Secret de Auth0 desde Supabase Vault
 * invocando la función una_chat_private.get_auth0_client_secret().
 *
 * @param {string} [connectionString] - URI de conexión PostgreSQL. Si no se pasa, toma process.env.VAULT_DATABASE_URL.
 * @returns {Promise<string>} El Client Secret descifrado.
 */
async function getClientSecretFromVault(connectionString) {
  const dbUrl = connectionString || process.env.VAULT_DATABASE_URL;
  if (!dbUrl) {
    throw new Error('VAULT_DATABASE_URL no está configurada en las variables de entorno.');
  }

  // Cargar certificado raíz oficial de Supabase si existe
  const caPath = path.join(__dirname, 'supabase-root-2021-ca.pem');
  let caCert = undefined;
  if (fs.existsSync(caPath)) {
    try {
      caCert = fs.readFileSync(caPath, 'utf8');
    } catch (e) {
      console.warn('[Vault] No se pudo leer supabase-root-2021-ca.pem:', e.message);
    }
  }

  // Limpiar parámetro sslmode de la URL para que no sobreescriba la configuración de CA personalizada en pg
  const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]+/g, '').replace(/\?$/, '');

  const clientConfig = {
    connectionString: cleanUrl,
    connectionTimeoutMillis: 15000,
  };

  if (caCert) {
    clientConfig.ssl = {
      rejectUnauthorized: true,
      ca: caCert,
    };
  } else {
    clientConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  const client = new Client(clientConfig);

  try {
    await client.connect();
    const query = 'SELECT una_chat_private.get_auth0_client_secret() AS secret;';
    const result = await client.query(query);

    if (!result.rows || result.rows.length === 0 || !result.rows[0].secret) {
      throw new Error('La función una_chat_private.get_auth0_client_secret() no retornó un secreto válido.');
    }

    return result.rows[0].secret.trim();
  } finally {
    try {
      await client.end();
    } catch (_) {}
  }
}

/**
 * Ejecuta la prueba de arranque contra Auth0 usando un código de prueba.
 * En la prueba de arranque, invalid_grant es el resultado esperado.
 *
 * @param {object} params
 * @param {string} params.domain
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @param {string} params.redirectUri
 * @returns {Promise<{ success: boolean, error: string, status: number, body: object }>}
 */
async function runStartupProbe({ domain, clientId, clientSecret, redirectUri }) {
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const tokenUrl = `https://${cleanDomain}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: 'vault-startup-probe',
    redirect_uri: redirectUri || 'http://localhost:3000/auth/callback',
    code_verifier: 'vault-startup-probe-verifier-123456789012345678901234567890',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json().catch(() => ({}));

    if (data.error === 'invalid_grant') {
      console.log('[Vault] Prueba de arranque contra Auth0: invalid_grant (éxito esperado)');
      return { success: true, error: 'invalid_grant', status: response.status, body: data };
    } else if (data.error === 'invalid_client' || data.error === 'access_denied') {
      console.warn(`[Vault] AVISO en prueba de arranque: ${data.error}. Verifique que el secreto en Vault coincida con la aplicación en Auth0.`);
      return { success: false, error: data.error, status: response.status, body: data };
    } else {
      console.log(`[Vault] Respuesta de prueba de arranque Auth0 (${response.status}):`, data.error || data);
      return { success: false, error: data.error, status: response.status, body: data };
    }
  } catch (error) {
    console.error('[Vault] Error al conectar con Auth0 en prueba de arranque:', error.message);
    return { success: false, error: error.message, status: 0, body: null };
  }
}

module.exports = {
  getClientSecretFromVault,
  runStartupProbe,
};
