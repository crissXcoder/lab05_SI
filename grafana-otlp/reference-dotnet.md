# .NET

Packages, same release train: `OpenTelemetry.Extensions.Hosting`, `OpenTelemetry.Exporter.OpenTelemetryProtocol`, `OpenTelemetry.Instrumentation.AspNetCore`, `OpenTelemetry.Instrumentation.Http`, `OpenTelemetry.Instrumentation.Runtime`.

Register only when `OTEL_EXPORTER_OTLP_ENDPOINT` is non-empty. `UseOtlpExporter()` needs `using OpenTelemetry;` and reads the standard `OTEL_EXPORTER_OTLP_*` variables. Do not pass the token in code.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(serviceName)
        .AddAttributes([
            new KeyValuePair<string, object>("deployment.environment", deploymentEnvironment)
        ]))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation(options =>
        {
            options.Filter = context =>
                !context.Request.Path.StartsWithSegments("/otlp");
        })
        .AddHttpClientInstrumentation(options =>
        {
            options.FilterHttpRequestMessage = request =>
                request.RequestUri?.Host != collectorHost;
        }))
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation())
    .WithLogging(_ => { }, options =>
    {
        options.IncludeFormattedMessage = true;
        options.IncludeScopes = true;
    })
    .UseOtlpExporter();
```

`deployment.environment` comes from `OTEL_RESOURCE_ATTRIBUTES` when that key is present, otherwise the host environment name lowercased (`Local` → `local`). Service name comes from `OTEL_SERVICE_NAME`, otherwise `<product>-api`.

Map `POST /otlp/v1/{signal}` next to the other endpoints. Read the endpoint and headers from the environment on each request so a wrong value is not baked in at startup only for the forwarder. Named `HttpClient` timeout 15 seconds.

`Results.Bytes` in some ASP.NET versions has no `statusCode` argument. Return a small `IResult` that sets the status code, content type, and body. On `HttpRequestException`, `TaskCanceledException`, or `InvalidOperationException`, respond 502 with `collector unavailable`.

If the repo already loads `.env` before this registration, keep that loader. If it does not, do not pretend `dotnet run` will see the frontend `.env`. For the local smoke test, load the keys into the process environment and then start the app. Do not add the token to `appsettings` or `launchSettings`.

Docker Compose may interpolate `.env`, but it only forwards keys that are listed. Add the four `OTEL_*` keys with empty defaults. No secret literals in the compose file.

Tests, when the repo already has a test project: endpoint empty yields 404; unknown signal yields 404; `Authorization=Basic%20...` decodes to `Basic ...`; a caller `Authorization` header is not the one sent upstream; a body over 1 MiB yields 413; a thrown `HttpRequestException` yields 502 and the body does not contain the test token. Use a fake token such as `unit-test-token`.
