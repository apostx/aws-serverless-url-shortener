import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';

const serviceName = process.env.POWERTOOLS_SERVICE_NAME ?? 'url-shortener';

/** Structured JSON logger shared by all handlers. */
export const logger = new Logger({ serviceName });

/** X-Ray tracer; used to capture AWS SDK calls as subsegments. */
export const tracer = new Tracer({ serviceName });
