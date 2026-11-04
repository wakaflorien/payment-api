import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { resolveFileSecrets } from '../config/env.validation.js';

/**
 * Used by the TypeORM CLI (pnpm migration:run / :generate / :revert), never by the app.
 * Reads the same variables as AppModule. Real environment variables win over .env,
 * and *_FILE secrets (Docker secrets) are supported.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (Docker, CI).
}
const env = resolveFileSecrets(process.env) as Record<
  string,
  string | undefined
>;

export default new DataSource({
  type: 'mysql',
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 3306),
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  entities: [join(import.meta.dirname, '..', '**', '*.entity.js')],
  migrations: [join(import.meta.dirname, 'migrations', '*.js')],
  synchronize: false,
});
