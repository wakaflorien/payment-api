import { readFileSync } from 'node:fs';

type Env = Record<string, unknown>;

const MIN_SECRET_LENGTH = 32;
const PROVIDERS = ['MTN', 'AIRTEL'] as const;

/**
 * Passed to ConfigModule.forRoot({ validate }). Runs once at boot and stops the app
 * with a list of every problem, rather than failing on the first payment.
 *
 * Also supports the `<NAME>_FILE` convention used by Docker / Kubernetes secrets:
 * JWT_SECRET_FILE=/run/secrets/jwt_secret loads JWT_SECRET from that file, so
 * secrets never have to sit in environment variables or `docker inspect` output.
 */
export function validateEnv(raw: Env): Env {
  const env = resolveFileSecrets(raw);
  const value = (key: string) =>
    typeof env[key] === 'string' && env[key] !== ''
      ? (env[key] as string)
      : undefined;
  const errors: string[] = [];
  const production = value('NODE_ENV') === 'production';

  for (const key of [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_DATABASE',
    'JWT_SECRET',
  ]) {
    if (!value(key)) {
      errors.push(`${key} is required`);
    }
  }
  if (value('DB_PORT') && !/^\d+$/.test(value('DB_PORT')!)) {
    errors.push('DB_PORT must be a number');
  }

  const mode = value('PAYMENT_PROVIDER_MODE') ?? 'simulator';
  if (!['simulator', 'http'].includes(mode)) {
    errors.push('PAYMENT_PROVIDER_MODE must be "simulator" or "http"');
  }
  if (
    mode === 'http' &&
    !value('PAYMENT_CALLBACK_URL')?.startsWith('https://')
  ) {
    errors.push(
      'PAYMENT_CALLBACK_URL must be an https:// URL when PAYMENT_PROVIDER_MODE=http',
    );
  }

  for (const provider of PROVIDERS) {
    const token = value(`${provider}_CALLBACK_TOKEN`);
    const secret = value(`${provider}_CALLBACK_SECRET`);
    if (Boolean(token) !== Boolean(secret)) {
      errors.push(
        `${provider}_CALLBACK_TOKEN and ${provider}_CALLBACK_SECRET must be set together`,
      );
    }
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      errors.push(
        `${provider}_CALLBACK_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
      );
    }
    if (production && !secret) {
      errors.push(
        `${provider}_CALLBACK_TOKEN and ${provider}_CALLBACK_SECRET are required in production`,
      );
    }
  }

  if (production) {
    if ((value('JWT_SECRET') ?? '').length < MIN_SECRET_LENGTH) {
      errors.push(
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production`,
      );
    }
    if (value('DB_SYNCHRONIZE') === 'true') {
      errors.push(
        'DB_SYNCHRONIZE must not be true in production: use migrations',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return env;
}

/** For every FOO_FILE variable, read the file into FOO (unless FOO is already set). */
export function resolveFileSecrets(raw: Env): Env {
  const env = { ...raw };
  for (const [key, path] of Object.entries(raw)) {
    if (!key.endsWith('_FILE') || typeof path !== 'string' || path === '') {
      continue;
    }
    const target = key.slice(0, -'_FILE'.length);
    if (env[target] === undefined || env[target] === '') {
      try {
        env[target] = readFileSync(path, 'utf8').trim();
      } catch {
        throw new Error(
          `Invalid environment configuration:\n  - ${key} points to ${path}, which can't be read`,
        );
      }
    }
  }

  return env;
}
