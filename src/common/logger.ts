import { ConsoleLogger, LogLevel } from '@nestjs/common';

const LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

/**
 * One JSON object per line in production (LOG_FORMAT=json), readable text locally.
 * JSON lines go straight into Loki / CloudWatch / Datadog without a parser.
 * LOG_LEVEL=warn keeps warn and everything more severe.
 */
export function createAppLogger(
  env: NodeJS.ProcessEnv = process.env,
): ConsoleLogger {
  const json =
    (env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'text')) ===
    'json';
  const threshold = LEVELS.indexOf((env.LOG_LEVEL ?? 'log') as LogLevel);

  return new ConsoleLogger({
    json,
    colors: !json,
    logLevels: LEVELS.slice(0, threshold === -1 ? 4 : threshold + 1),
  });
}
