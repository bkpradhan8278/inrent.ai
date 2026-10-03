import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | null = null;

/**
 * Starts OpenTelemetry tracing when OTEL_EXPORTER_OTLP_ENDPOINT is configured.
 * Spans are created manually around gateway stages (auth, routing, provider call, billing).
 */
export function initTelemetry(serviceName: string): { enabled: boolean; shutdown: () => Promise<void> } {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || sdk) {
    return { enabled: Boolean(sdk), shutdown: async () => {} };
  }
  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
  });
  sdk.start();
  return {
    enabled: true,
    shutdown: async () => {
      await sdk?.shutdown();
      sdk = null;
    },
  };
}
