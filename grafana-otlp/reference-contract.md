# Contract

Grafana gives two different instructions. Use the direct gateway, not the collector wizard.

| Use | Do not use |
|---|---|
| Gateway `https://otlp-gateway-<region>.grafana.net/otlp` | `otelcol-contrib` YAML from the collector wizard |
| Explore → Tempo, Loki, or Mimir/Prometheus, or Application Observability | Pyroscope (`/a/grafana-pyroscope-app`) — that is profiles, and this setup does not send them |
| Protocol `http/protobuf` | A new Grafana Connection or data source |

The collector "Test connection" button looks for the collector's own metrics. It stays empty when apps export directly. That empty test is not a failure.

## Env

Put secrets in a gitignored `.env` or in the process environment. Never commit them. `.env.example` lists the keys with empty values.

```bash
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<region>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64>
OTEL_SERVICE_NAME=<product>-api
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=local
```

Frontend-only flag, not a secret:

```bash
VITE_OTEL_ENABLED=true
VITE_API_BASE_URL=
```

`VITE_API_BASE_URL` empty means the browser calls same-origin `/otlp`. In production set it to the API origin with no trailing slash.

Header rules:

- No surrounding quotes. Quoted values become part of the key or the token for runtimes that do not strip them.
- Percent-encode the space: `Basic%20`, not `Basic `.
- The base64 is `base64("<instance id>:<glc_ token>")` from Grafana, not the literal text `base64(1860817:<api key>)`.
- A usable token decodes, the left side is digits, the right side starts with `glc_` and is much longer than a few dozen characters. Length not divisible by 4 means the paste was cut off.

Who actually sees the variables:

| Runtime | Loads `.env` by itself? |
|---|---|
| Vite dev server | Yes, at startup. Existing process env wins and is not replaced by `.env`. |
| .NET `dotnet run` | No, unless this repo already loads it before telemetry registration. |
| Nest | Only if `dotenv` runs before the SDK is constructed. `ConfigModule` is too late. |

Copying keys into the frontend `.env` does not configure a .NET process. After any env edit, restart the process that must export.

## Two different URLs

The gateway base is `https://<host>/otlp`.

- Server exporter and forwarder target: `{endpoint}/v1/{signal}` → `https://<host>/otlp/v1/traces`.
- Browser exporter URL: `{apiBase or ''}/otlp/v1/{traces\|logs}`. The JS exporter does not append `/v1/traces`.
- Vite proxy `target` is the gateway **origin** only (`https://<host>`). The incoming path is already `/otlp/v1/traces`. A target that includes `/otlp` doubles the path.

## Forwarder

`POST /otlp/v1/{signal}` is public. It does not check JWT. It forwards the raw bytes and `Content-Type`, and sets `Authorization` from the server env. Parse headers by splitting on commas, then on the first `=`, then percent-decode the value.

Service names: `<product>-api` and `<product>-fe`, lowercase, from the product name. Do not copy another product's name. Resource attribute `deployment.environment` is `local` for a local run and `production` for a production build, unless `OTEL_RESOURCE_ATTRIBUTES` or `VITE_DEPLOYMENT_ENVIRONMENT` sets it.

## Audit script

`scripts/audit-otel.mjs` is a hint. A string match does not prove the filter, the raw-body handling, or that the running process has the env. Read the registration and the proxy before calling the setup done.
