---
name: grafana-otlp
description: >-
  Checks a .NET, NestJS, or React (Vite) app for this team's Grafana Cloud
  OTLP setup and adds it when it is missing. The browser posts to same-origin
  /otlp; the Vite dev proxy or the API forwarder attaches the Authorization
  header. Use when the user asks to add OpenTelemetry, OTLP, or Grafana
  traces, logs, or metrics, or when nothing shows in Grafana, Tempo, Loki,
  Mimir, Pyroscope, or the OpenTelemetry Collector connection test.
---

# Grafana OTLP

Direct OTLP over HTTP/protobuf to a Grafana Cloud gateway. The browser never receives the API key. Do not install `otelcol-contrib` and do not add a Grafana data source for this path.

## Workflow

1. Find each app root. A workspace can contain a backend and a frontend. Treat .NET, Nest, and React as separate apps. If several apps match and the user did not say which, ask once, then continue.
2. Run the audit from this skill directory. Pass every app root:

```bash
node scripts/audit-otel.mjs <app-root> [<app-root>...]
```

The script prints shape flags only. Do not read `.env` into the chat, do not print `OTEL_EXPORTER_OTLP_HEADERS`, and do not decode the token into the reply.

3. Read [reference-contract.md](reference-contract.md). Then read only the stack reference you are changing: [reference-dotnet.md](reference-dotnet.md), [reference-nest.md](reference-nest.md), or [reference-react.md](reference-react.md).
4. If the audit shows the contract already, do not rewrite it. Report the gaps that are only config or process state.
5. If the contract is missing or wrong, implement it in that app's existing layout and language. Keep PostHog or other analytics. Do not put the token in source, `appsettings*.json`, `launchSettings.json`, `VITE_` variables, logs, or tests.
6. Stop before restarting anything when the audit says the header is missing, quoted, or invalid base64. Tell the developer which file and key to fix. They paste the token. You do not.
7. After a valid header is saved, restart the process that must see it. Saving a file does not update a running API or Vite server.
8. Smoke-test using [reference-failures.md](reference-failures.md). If Grafana stays empty, walk that catalog before changing code again.

## Report

Write this in the developer's language. Status is `present`, `missing`, or `wrong`.

```markdown
## Grafana OTLP
- Backend (.NET or Nest): <status> — <one line>
- React: <status> — <one line>
- Env shape: <valid | what is wrong, no secret values>
- What I changed: <files or "nothing">
- What you need to do: <restart, paste the token, which Grafana screen>
```

## Non-negotiables

- Endpoint is the gateway base ending in `/otlp`, never `/otlp/v1/traces`. The .NET and Node exporters append the signal path. The browser exporter does not, so the React URL must already end in `/v1/traces` or `/v1/logs`.
- Header value is `Authorization=Basic%20<base64>` with no quotes. The base64 decodes to `<instanceId>:<api key>` and the key starts with `glc_`.
- Export stays off when `OTEL_EXPORTER_OTLP_ENDPOINT` is empty.
- The forwarder accepts only `traces`, `metrics`, and `logs`. It replaces `Authorization` with the server header and ignores the caller's header. Unknown signal or empty endpoint: 404. Body over 1 MiB: 413. Network failure: 502 with body exactly `collector unavailable` and no credential in the body.
- Drop server spans whose path starts with `/otlp`, and outbound spans whose host is the gateway host.
- `VITE_OTEL_ENABLED` must be the exact string `true`. Any other value leaves the browser SDK off.
- Local runs use `deployment.environment=local` even when the gateway is the production Grafana endpoint.

## References

- [reference-contract.md](reference-contract.md) — shared env, proxy, and forwarder contract
- [reference-dotnet.md](reference-dotnet.md) — ASP.NET implementation
- [reference-nest.md](reference-nest.md) — NestJS implementation
- [reference-react.md](reference-react.md) — Vite React implementation
- [reference-failures.md](reference-failures.md) — smoke test and the failures this setup actually hit
