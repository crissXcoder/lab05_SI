/**
 * @file unalib.js
 * @description Módulo de validación, sanitización y procesamiento multimedia para UNA Chat.
 * Proporciona validación estricta de teléfonos, URLs de imágenes y videos de YouTube,
 * neutralización de ataques de inyección de scripts (XSS) y formateo seguro de contenido.
 * @module unalib
 */

'use strict';

/**
 * Escapa caracteres HTML peligrosos para prevenir inyecciones de código (XSS).
 * @param {string} text - Cadena de texto a escapar.
 * @returns {string} Cadena sanitizada con entidades HTML.
 */
function sanitizeHtml(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitiza URLs para su uso seguro dentro de atributos HTML (src, href).
 * @param {string} url - URL a sanitizar.
 * @returns {string} URL segura para atributos.
 */
function sanitizeAttrUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }
  return url
    .trim()
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Valida un formato hexadecimal de color (#RRGGBB o #RGB).
 * @param {string} color - Código de color.
 * @returns {string} Color validado o color por defecto seguro.
 */
function sanitizeColor(color) {
  if (typeof color === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) {
    return color;
  }
  return '#333333';
}

const unalib = {
  /**
   * Valida si una cadena corresponde a un número de teléfono válido.
   * @param {string} phone - Cadena a validar.
   * @returns {boolean} True si el formato es válido, false en caso contrario.
   */
  is_valid_phone: function (phone) {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    const trimmed = phone.trim();
    const re = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/i;
    try {
      return re.test(trimmed) && /[0-9]{4,}/.test(trimmed.replace(/\D/g, ''));
    } catch (e) {
      console.error('Error validando teléfono:', e);
      return false;
    }
  },

  /**
   * Valida si una cadena es una URL válida de imagen (.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .avif).
   * Solo permite protocolos seguros http y https.
   * @param {string} url - URL a validar.
   * @returns {boolean} True si es una URL de imagen válida, false en caso contrario.
   */
  is_valid_url_image: function (url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const trimmed = url.trim();

    // Descartar esquemas de ejecución como javascript:, data:, vbscript:
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      return false;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      return /\.(?:jpg|jpeg|png|gif|bmp|webp|svg|avif)$/i.test(parsed.pathname);
    } catch (e) {
      // Fallback para URLs relativas o casos especiales
      const regexFallback = /^https?:\/\/[^\s/$.?#].[^\s]*\.(?:jpg|jpeg|png|gif|bmp|webp|svg|avif)(?:\?[^\s]*)?$/i;
      return regexFallback.test(trimmed);
    }
  },

  /**
   * Valida si una cadena corresponde a una URL de video de YouTube soportada.
   * @param {string} url - URL a validar.
   * @returns {boolean} True si es una URL válida de YouTube con un ID de 11 caracteres.
   */
  is_valid_yt_video: function (url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const trimmed = url.trim();

    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      return false;
    }

    const re = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})(?:[?&][^\s]*)?$/i;
    try {
      return re.test(trimmed);
    } catch (e) {
      console.error('Error validando URL de YouTube:', e);
      return false;
    }
  },

  /**
   * Extrae el ID del video de YouTube a partir de una URL válida.
   * @param {string} url - URL de YouTube.
   * @returns {string|null} ID del video (11 caracteres) o null si es inválido.
   */
  getYTVideoId: function (url) {
    if (!this.is_valid_yt_video(url)) {
      return null;
    }
    try {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i);
      return (match && match[1]) ? match[1] : null;
    } catch (e) {
      console.error('Error extrayendo ID de YouTube:', e);
      return null;
    }
  },

  /**
   * Genera el código HTML seguro para incrustar un reproductor de video de YouTube.
   * @param {string} url - URL del video de YouTube.
   * @returns {string} Etiqueta <iframe> segura o mensaje saneado si es inválido.
   */
  getEmbeddedCode: function (url) {
    const id = this.getYTVideoId(url);
    if (!id) {
      return sanitizeHtml(url);
    }
    const safeId = encodeURIComponent(id);
    return `<iframe width="560" height="315" src="https://www.youtube.com/embed/${safeId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="max-width: 100%; border-radius: 8px; margin-top: 5px; display: block;"></iframe>`;
  },

  /**
   * Genera la etiqueta HTML <img> segura para una URL de imagen válida.
   * @param {string} url - URL de la imagen.
   * @returns {string} Etiqueta <img> con atributos de seguridad o texto saneado si es inválida.
   */
  getImageTag: function (url) {
    if (!this.is_valid_url_image(url)) {
      return sanitizeHtml(url);
    }
    const safeUrl = sanitizeAttrUrl(url);
    return `<img src="${safeUrl}" alt="Imagen compartida" style="max-height: 400px; max-width: 100%; object-fit: contain; border-radius: 6px; margin-top: 5px; display: block;" loading="lazy" />`;
  },

  /**
   * Sanitiza cualquier texto plano eliminando o neutralizando scripts e inyecciones HTML.
   * @param {string} text - Texto a sanitizar.
   * @returns {string} Texto seguro.
   */
  sanitizeText: function (text) {
    return sanitizeHtml(text);
  },

  /**
   * Procesa y valida un mensaje entrante en formato JSON o texto plano.
   * Detecta y transforma URLs válidas de imagen o video, neutraliza scripts y payloads XSS,
   * y garantiza la integridad de los datos.
   * @param {string|object} msg - Mensaje en formato JSON string o como objeto.
   * @returns {string} Cadena JSON con el mensaje validado y seguro.
   */
  validateMessage: function (msg) {
    if (msg === undefined || msg === null) {
      return JSON.stringify({ nombre: 'Anónimo', mensaje: '', color: '#333333' });
    }

    let obj;

    if (typeof msg === 'object') {
      obj = { ...msg };
    } else if (typeof msg === 'string') {
      try {
        obj = JSON.parse(msg);
        if (!obj || typeof obj !== 'object') {
          obj = { mensaje: String(msg) };
        }
      } catch (e) {
        // No es JSON, procesar como mensaje de texto directo
        obj = { mensaje: String(msg) };
      }
    } else {
      obj = { mensaje: String(msg) };
    }

    // Normalizar y sanitizar propiedades
    obj.nombre = sanitizeHtml(String(obj.nombre || 'Anónimo')).trim();
    obj.color = sanitizeColor(obj.color);
    const rawMensaje = (obj.mensaje !== undefined && obj.mensaje !== null) ? String(obj.mensaje).trim() : '';

    // Detección y transformación según tipo de contenido
    if (this.is_valid_url_image(rawMensaje)) {
      obj.mensaje = this.getImageTag(rawMensaje);
      obj.tipo = 'imagen';
    } else if (this.is_valid_yt_video(rawMensaje)) {
      obj.mensaje = this.getEmbeddedCode(rawMensaje);
      obj.tipo = 'video';
    } else {
      // Mensaje de texto estándar o intento de inyección de script:
      // Neutralizar de forma segura para que no se ejecute en el DOM
      obj.mensaje = sanitizeHtml(rawMensaje);
      obj.tipo = 'texto';
    }

    return JSON.stringify(obj);
  },

  /**
   * Alias en español de validateMessage conforme al requerimiento del laboratorio.
   * @param {string|object} msg - Mensaje a validar.
   * @returns {string} Mensaje procesado y saneado en JSON.
   */
  validarMensaje: function (msg) {
    return this.validateMessage(msg);
  }
};

module.exports = unalib;