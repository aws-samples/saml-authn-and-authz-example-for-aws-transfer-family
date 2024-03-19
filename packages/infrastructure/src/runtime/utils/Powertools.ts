import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import middy from "@middy/core";
import { Handler } from "aws-lambda/handler";

export interface PowertoolsConfig {
  namespace: string;
  serviceName: string;
  logLevel: string;
}

export class Powertools {
  static readonly DEFAULT_CONFIG = {
    logLevel: process.env.LOG_LEVEL ?? "INFO",
    serviceName: process.env.POWERTOOLS_SERVICE_NAME ?? "service",
    namespace: process.env.POWERTOOLS_METRICS_NAMESPACE ?? "default",
  };

  readonly metrics: Metrics;
  readonly logger: Logger;
  readonly tracer: Tracer;

  public constructor(config: { [key: string]: any | undefined } = {}) {
    const mergedConfig = { ...Powertools.DEFAULT_CONFIG, ...config };
    this.metrics = new Metrics({
      namespace: mergedConfig.namespace,
      serviceName: mergedConfig.serviceName,
    });
    this.logger = new Logger({
      // @ts-ignore
      logLevel: mergedConfig.logLevel,
      serviceName: mergedConfig.serviceName,
    });
    this.tracer = new Tracer({
      serviceName: mergedConfig.serviceName,
      captureHTTPsRequests: true,
    });
  }

  wrap(handler: any): Handler {
    return middy(handler)
      .use(captureLambdaHandler(this.tracer))
      .use(logMetrics(this.metrics, { captureColdStartMetric: true }));
  }
}
