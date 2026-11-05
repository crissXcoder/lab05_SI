# Smoke test and failures

Do the checks you can run. Tell the developer the ones only they can see in the Grafana UI. Never print the header or the token. When you cite a log line, redact `Basic …` and `glc_…` first.

## Restart, then probe

1. Confirm the audit says the header decodes, `quoted=false`, and `viteFlag=true` when there is a React app.
2. Restart the backend and Vite. A process started before the keys existed is still exporting nothing.
3. For .NET, the new process environment must contain the `OTEL_*` keys. Starting `dotnet run` in a shell that never loaded them does not read `.env`.
4. For Vite, set `API_PROXY_TARGET` to the live API URL in that same command. Vite will not replace a value already in the process, including a stale `http://localhost:8080`.
5. `POST` a tiny OTLP JSON document to `{api}/otlp/v1/traces` and to `{vite}/otlp/v1/traces` with `Content-Type: application/json`. Use a trace id of 32 hex chars and a span id of 16 hex chars. Service name in the payload should match `<product>-api` or `<product>-fe`.

Read the status. Do not follow a 401 by retrying with a logged header.

| Status | Meaning |
|---|---|
| 200 | The gateway accepted the body. Ingest can still take about a minute. |
| 401 | Token rejected. Almost always a truncated paste, quotes, or `Basic` plus a raw space that the server process did not decode. Fix `.env`, restart, probe again. |
| 404 | Endpoint empty, unknown signal, or the Vite `/otlp` proxy was not registered. Vite was started without the keys, or `createOtlpProxy` returned null. |
| 413 | Body larger than 1 MiB. The smoke body is small, so this means the route is matching a different handler. |
| 502 `collector unavailable` | The forwarder is up and the gateway was unreachable. The body must be that phrase only. |
| Connection refused or timeout | Wrong host or port. Check who is listening. Do not assume the port in `.env.example` is free. |

Then load the React app in a browser once. A `curl` of `index.html` does not run the SDK. Batch export waits a few seconds.

## Where to look in Grafana

Service names `<product>-api` and `<product>-fe`, attribute `deployment.environment=local`.

- Traces: Application Observability, or Explore → Tempo.
- Logs: Explore → Loki.
- Metrics: Explore → Mimir or Prometheus.

Pyroscope staying empty is expected. The collector wizard staying on "No metrics were found" is expected. Do not install the collector to satisfy that button.

## Failures already seen

| What the developer sees | Cause | What to do |
|---|---|---|
| "I saved the env" and Grafana is still empty | The running API and Vite were started before the save | Restart both. Confirm with the probe, not with a file timestamp. |
| Keys exist only in the frontend `.env` | .NET does not read that file | Load them into the API process, or into the mechanism that process actually uses. |
| Header length is short and base64 throws | The token was cut off on one line | Replace the value after `Basic%20`. A real `glc_` token is a long base64 string, usually padded with `=`. |
| Values are wrapped in quotes | The quotes are part of the value for .NET | Remove them. Vite's loader strips quotes, so the proxy can work while the API 401s. |
| `Authorization=Basic <token>` with a literal space | The OTLP env format wants percent-encoding | Use `Basic%20`. Our forwarder decodes that back to a space. |
| Browser still silent, API traces exist | `VITE_OTEL_ENABLED` missing or not exactly `true` | Set `true`, restart Vite, reload the page. |
| `/otlp` returns 404 only from Vite | Proxy not registered | Endpoint or header missing at Vite startup, or the config did not spread the proxy. |
| Frontend API calls time out | `API_PROXY_TARGET` points at a port held by something else | Point it at the API that just answered `/`. |
| SDK throws and the page is blank | `initOtel` is not in `try/catch`, or the exporter URL is missing `/v1/traces` | Fix the URL. Swallow init errors. |
| Spans that only say `/otlp` or the gateway host | Loop: the export is traced | Filter those server and outbound spans. |
| Grafana 401 in the API log | Bad header on the server exporter | Same token fix as the forwarder. Redact the log before quoting it. |
| UI has no business data | Empty database, not a telemetry bug | Seed or call any route. Spans come from the request. |
| User asks to commit the `.env` | The file holds the Grafana key | Refuse. `.env.example` stays empty. `.gitignore` must cover `.env`. |

If the probe returns 200 and Tempo has no service after several minutes, ask the developer to check the stack, the time range, and the `service.name` filter. Do not switch them to the collector wizard.
