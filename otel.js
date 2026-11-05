'use strict';

/**
 * @file otel.js
 * @description Configuración e inicialización de OpenTelemetry (OTLP HTTP) para UNA Chat.
 * Exporta trazas a Tempo, métricas a Mimir y logs a Loki en Grafana Cloud.
 */

require('dotenv').config();
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');

// En Vercel se prohíbe explícitamente enviar telemetría a Grafana Cloud según la guía
if (process.env.VERCEL) {
  console.log('[OpenTelemetry] Despliegue en Vercel detectado: Telemetría OTLP desactivada estrictamente.');
} else {
  const rawEndpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();
  let isValidEndpoint = false;
  let collectorHost = '';

  try {
    if (rawEndpoint && !rawEndpoint.includes('<') && !rawEndpoint.includes('>')) {
      collectorHost = new URL(rawEndpoint).host;
      isValidEndpoint = Boolean(collectorHost);
    }
  } catch (e) {
    isValidEndpoint = false;
  }

  if (isValidEndpoint) {
    // Si el endpoint no termina en /otlp, lo usamos como base
    const cleanEndpoint = rawEndpoint.replace(/\/+$/, '');

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': process.env.OTEL_SERVICE_NAME || 'una-chat',
        'deployment.environment': process.env.OTEL_ENVIRONMENT || 'local',
      }),
      traceExporter: new OTLPTraceExporter({
        url: cleanEndpoint.endsWith('/v1/traces') ? cleanEndpoint : `${cleanEndpoint}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: cleanEndpoint.endsWith('/v1/metrics') ? cleanEndpoint : `${cleanEndpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 5000, // Exportar cada 5 segundos para actualización rápida de métricas
      }),
      logRecordProcessors: [
        new BatchLogRecordProcessor(
          new OTLPLogExporter({
            url: cleanEndpoint.endsWith('/v1/logs') ? cleanEndpoint : `${cleanEndpoint}/v1/logs`,
          })
        ),
      ],
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (req) => (req.url || '').startsWith('/otlp'),
            ignoreOutgoingRequestHook: (req) => req.hostname === collectorHost,
          },
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });

    try {
      sdk.start();
      console.log(`[OpenTelemetry] Telemetría iniciada exitosamente hacia Grafana Cloud: ${collectorHost}`);
    } catch (err) {
      console.error('[OpenTelemetry] Error al iniciar SDK:', err);
    }

    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => console.log('[OpenTelemetry] SDK finalizado'))
        .catch((err) => console.error('[OpenTelemetry] Error al apagar SDK:', err))
        .finally(() => process.exit(0));
    });
  } else {
    console.log('[OpenTelemetry] Monitoreo OTLP inactivo (OTEL_EXPORTER_OTLP_ENDPOINT no configurado)');
  }
}
