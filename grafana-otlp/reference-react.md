# React (Vite)

Browser signals are traces, document load, fetch, and unhandled errors. No browser metrics. The token stays in Node (the Vite proxy), never in a `VITE_` variable and never in client code.

Packages: `@opentelemetry/api`, `@opentelemetry/api-logs`, `@opentelemetry/sdk-trace-web`, `@opentelemetry/resources`, `@opentelemetry/context-zone`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/sdk-logs`, `@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-fetch`, `@opentelemetry/instrumentation-document-load`. Install them in one shot so peer deps match. The web SDK is 2.x while several exporters are still 0.x; that split is expected.

## Client

Call `initOtel()` from `main.tsx` before `createRoot`, after existing analytics imports. `initOtel` returns immediately unless `import.meta.env.VITE_OTEL_ENABLED === 'true'`. Wrap the body in `try/catch`. Telemetry must not blank the page.

```typescript
const resource = resourceFromAttributes({
  'service.name': '<product>-fe',
  'deployment.environment': import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT?.trim()
    || (import.meta.env.DEV ? 'local' : 'production'),
})

new WebTracerProvider({
  resource,
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter({
      url: otelSignalUrl(import.meta.env.VITE_API_BASE_URL, 'traces'),
    })),
  ],
}).register({ contextManager: new ZoneContextManager() })
```

`otelSignalUrl` returns `{base}/v1/traces` or `{base}/v1/logs`, where `base` is `{VITE_API_BASE_URL}/otlp` or `/otlp` when the API base is empty.

Logs: `LoggerProvider` with `BatchLogRecordProcessor({ exporter })`, then `logs.setGlobalLoggerProvider`. On `window` `error` and `unhandledrejection`, emit `SeverityNumber.ERROR`. Do not log tokens or headers.

`FetchInstrumentation` `ignoreUrls: [/\/otlp/]`. Also register `DocumentLoadInstrumentation`.

## Dev proxy

In `vite.config.ts`, `loadEnv(mode, root, '')` so non-`VITE_` keys are visible to the config and still absent from the client bundle. Build the `/otlp` proxy only when both the endpoint and an `Authorization` header exist. Same proxy on `server` and `preview`.

```typescript
export function createOtlpProxy(env: Record<string, string | undefined>) {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
  const authorization = authorizationValue(env.OTEL_EXPORTER_OTLP_HEADERS)
  if (!endpoint || !authorization) return null
  return {
    target: new URL(endpoint).origin,
    changeOrigin: true,
    secure: true,
    headers: { Authorization: authorization },
  }
}
```

`authorizationValue` splits on commas, takes the value after the first `=`, and `decodeURIComponent`s it so `Basic%20` becomes `Basic `.

Keep the existing `/api` proxy. Point `API_PROXY_TARGET` at the API process that is actually listening. A documented port can be owned by another program and time out.

If the frontend is Next.js instead of Vite, do not put the token in `NEXT_PUBLIC_`. Add a route handler that performs the same forward, and point the browser at that route. If it is neither Vite nor Next, say so and stop instead of inlining the key in the client.

Tests, when the repo already uses Vitest: the flag is true only for `'true'`; the signal URL ends with `/v1/traces`; the proxy is null without an endpoint or header; client source does not contain `grafana.net`, `Basic`, or `Authorization`.
