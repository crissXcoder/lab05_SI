'use strict';

/**
 * @file logger.js
 * @description Utilidad de logging estructurado integrado con OpenTelemetry Logs y consola.
 * Asocia automáticamente el trace_id y span_id activo de la solicitud para correlación en Grafana Cloud (Loki <-> Tempo).
 */

const opentelemetry = require('@opentelemetry/api');

const otelLogger = opentelemetry.logs.getLogger('una-chat');

function getTraceContext() {
  const activeSpan = opentelemetry.trace.getActiveSpan();
  if (activeSpan) {
    const ctx = activeSpan.spanContext();
    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
    };
  }
  return {};
}

function logInfo(message, attributes = {}) {
  const traceCtx = getTraceContext();
  const allAttributes = { ...attributes, ...traceCtx };

  // Salida estándar formateada para consola/Docker
  const tracePrefix = traceCtx.trace_id ? `[trace_id=${traceCtx.trace_id}] ` : '';
  console.log(`[INFO] ${tracePrefix}${message}`, Object.keys(attributes).length ? attributes : '');

  // Envío a Grafana Loki vía OpenTelemetry Logs
  try {
    otelLogger.emit({
      severityText: 'INFO',
      severityNumber: opentelemetry.SeverityNumber ? opentelemetry.SeverityNumber.INFO : 9,
      body: message,
      attributes: allAttributes,
    });
  } catch (err) {
    // Si OTLP no está conectado o falla, la aplicación sigue sin bloquearse
  }
}

function logError(message, error, attributes = {}) {
  const traceCtx = getTraceContext();
  const allAttributes = {
    ...attributes,
    ...traceCtx,
    'error.name': error?.name || 'Error',
    'error.message': error?.message || String(error),
    'error.stack': error?.stack || '',
  };

  const tracePrefix = traceCtx.trace_id ? `[trace_id=${traceCtx.trace_id}] ` : '';
  console.error(`[ERROR] ${tracePrefix}${message}`, error);

  try {
    otelLogger.emit({
      severityText: 'ERROR',
      severityNumber: opentelemetry.SeverityNumber ? opentelemetry.SeverityNumber.ERROR : 17,
      body: `${message}: ${error?.message || error}`,
      attributes: allAttributes,
    });
  } catch (err) {
    // Silencio seguro
  }
}

module.exports = {
  logInfo,
  logError,
  getTraceContext,
};

