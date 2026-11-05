# NestJS

The SDK must start before `NestFactory.create`. `ConfigModule` loads `.env` too late, after the SDK has already read empty variables.

```typescript
import 'dotenv/config'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
if (endpoint) {
  const collectorHost = new URL(endpoint).host
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': process.env.OTEL_SERVICE_NAME || '<product>-api',
      'deployment.environment': deploymentEnvironment(),
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => (req.url ?? '').startsWith('/otlp'),
          ignoreOutgoingRequestHook: (req) => req.hostname === collectorHost,
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  })
  sdk.start()
}
```

`main.ts` first line: `import './otel'`. The exporters read `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, and `OTEL_EXPORTER_OTLP_PROTOCOL` from the environment. `dotenv/config` does not override variables that are already set.

## Raw body

OTLP is protobuf, or JSON that must be forwarded unchanged. Nest's JSON parser runs inside `NestFactory.create` and will consume the body first.

Prefer this shape when the app does not already customize the parser:

```typescript
const app = await NestFactory.create(AppModule, { bodyParser: false })
app.use('/otlp/v1', express.raw({ type: () => true, limit: '1mb' }), forwardOtlp)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
```

If the app already depends on Nest's default parser, do not turn it off blindly. Add an equivalent raw parser that runs only for `/otlp` and still runs before JSON parsing. Read `req.body` as a `Buffer`. Do not `JSON.parse` it. Over 1 MiB: 413. Signal not in `traces` | `metrics` | `logs`, or endpoint empty: 404. Forward to `{endpoint}/v1/{signal}` with the server `Authorization` header. On network failure: 502 and the text `collector unavailable`.

`@Post('otlp/v1/:signal')` on a normal controller is the wrong default: the parsed body is not the original bytes.

Install the SDK, auto-instrumentations, the three OTLP HTTP exporters, `sdk-logs`, `sdk-metrics`, and `dotenv` if the project does not already load `.env` at process start. Keep them on one OpenTelemetry JS release train (`sdk-node` 0.2xx with matching exporters).
