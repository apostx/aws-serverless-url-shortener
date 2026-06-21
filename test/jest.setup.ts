// Deterministic, quiet environment for Lambda handler unit tests.
process.env.POWERTOOLS_TRACE_ENABLED = 'false';
process.env.POWERTOOLS_LOG_LEVEL = 'SILENT';
process.env.POWERTOOLS_LOGGER_LOG_LEVEL = 'SILENT';
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
process.env.TABLE_NAME = process.env.TABLE_NAME ?? 'url-shortener-test';
