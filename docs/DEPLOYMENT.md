# Deployment

How to prepare this service for production. For how the payment flow works, see [ARCHITECTURE.md](ARCHITECTURE.md).

- [1. Sensitive data](#1-sensitive-data)
- [2. Docker deployment](#2-docker-deployment)
- [3. Logs and error monitoring](#3-logs-and-error-monitoring)
- [4. Database backups and recovery](#4-database-backups-and-recovery)
- [5. Secure production configuration](#5-secure-production-configuration)
- [6. Release checklist](#6-release-checklist)

**What was exercised.** The production stack in `docker-compose.prod.yml` was built and run locally: MySQL → one-off migration job → API with a passing health check, then a full payment (request, three identical callbacks, one balance change). A backup was taken with `scripts/db-backup.sh` and restored with `scripts/db-restore.sh`, including the checksum check. **Not exercised:** a real cloud deployment, offsite backup copies, binlog point-in-time recovery, and the live MTN/Airtel sandboxes.

## 1. Sensitive data

| Secret | Who uses it |
|---|---|
| `JWT_SECRET` | signs staff tokens |
| `MTN_CALLBACK_TOKEN`, `MTN_CALLBACK_SECRET`, `AIRTEL_*` | authenticate providers calling **us** |
| `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`, `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET` | authenticate **us** to the providers |
| DB passwords | the API uses a user that can only read and write rows; migrations and backups use the schema owner |

Rules:

1. **Never in git or in the image.** `.env`, `secrets/` and `backups/` are git-ignored and docker-ignored. `.env.example` holds only local placeholders.
2. **Load from files, not environment variables.** Every setting also accepts a `<NAME>_FILE` variant (`JWT_SECRET_FILE=/run/secrets/jwt_secret`). Compose mounts secrets as files under `/run/secrets`, so they don't show up in `docker inspect`, `/proc/<pid>/environ` of child processes or crash dumps. In Kubernetes, mount a `Secret` volume the same way. In a cloud, mount from the platform's secret manager (AWS Secrets Manager / GCP Secret Manager / Vault).
3. **Generated, not chosen.** `scripts/generate-secrets.sh` creates random 48-character values (mode `600`) and never overwrites an existing file.
4. **Validated at boot.** `src/config/env.validation.ts` stops the app with a list of every problem. In production it requires `JWT_SECRET` and each provider secret to be at least 32 characters, both provider token+secret pairs to be set, and `DB_SYNCHRONIZE` to be off. A misconfigured deploy fails at startup, not on the first payment.
5. **Least privilege.** The API's DB user (`jali_app`) has `SELECT, INSERT, UPDATE, DELETE` only. It can't alter or drop tables, so a SQL-injection or code bug can't drop the ledger. The schema owner (`jali_migrator`) is used only by the migration job and backups.
6. **Rotation.** Rotate a callback secret by agreeing a cut-over time with the provider and deploying the new value to both sides. (Supporting two valid secrets during overlap is a small change in `CallbackCredentialsStore`, not built here.) Rotating `JWT_SECRET` logs everyone out, which is acceptable. Rotate everything if a secret may have leaked.
7. **Logs never contain secrets.** The access log records method, path (without the query string), status and duration. It doesn't record headers or bodies. Phone numbers are masked (`078****456`).

## 2. Docker deployment

Files: [`Dockerfile`](../Dockerfile), [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`docker/mysql/init/`](../docker/mysql/init).

```bash
scripts/generate-secrets.sh                                    # once
docker compose -f docker-compose.prod.yml up -d --build       # db → migrate → api
curl localhost:3000/api/health                                # {"status":"ok","database":"up"}
```

**Image.** A multi-stage build: dependencies and TypeScript compilation happen in a `build` stage, and the final `runtime` stage contains only compiled JavaScript and production dependencies, with no compiler, tests or sources. It runs as the non-root `node` user, sets `NODE_ENV=production` and `TZ=UTC`, and has a `HEALTHCHECK` on `/api/health`, which pings the database. The process is started in exec form, so `docker stop` delivers SIGTERM and `enableShutdownHooks()` lets in-flight requests and open transactions finish.

**Compose services.**

| Service | Purpose |
|---|---|
| `db` | MySQL 8.4. Not published to the host, so only the other containers can reach it. Binary logs on, with 7 days of retention (for point-in-time recovery). Data in a named volume. |
| `migrate` | Runs pending migrations **once** as the schema owner, then exits. The API waits for it (`service_completed_successfully`). Running migrations in a job instead of on every API boot means several replicas never race on DDL. |
| `api` | The service. `read_only` root filesystem, all Linux capabilities dropped, `no-new-privileges`, CPU and memory limits, secrets mounted as files. |
| `backup` | On-demand job (`--profile ops`). See section 4. |

**Deploying a change.** Build once, promote the same image through environments. `docker compose up -d --build` re-runs `migrate` first (a no-op when nothing is pending), and then replaces `api`. Migrations should be backward compatible (add columns before using them, remove them a release later), so the previous version can keep serving while a new one starts.

**Beyond one host.** Run two or more `api` replicas behind a load balancer. This is safe by design: callbacks are idempotent, payments are serialized by row locks, and the reconciliation job uses `SKIP LOCKED`. Use a managed MySQL (RDS, Cloud SQL) with automated backups and a replica. Terminate TLS at the load balancer and set `TRUST_PROXY=1`.

> **Development uses a different file.** `docker-compose.dev.yml` (`pnpm docker:dev`) bind-mounts the source for hot reload and uses throwaway local credentials. Never deploy it.

## 3. Logs and error monitoring

**Logs.** In production (`NODE_ENV=production` or `LOG_FORMAT=json`) every log line is a single JSON object on stdout, ready for Loki, CloudWatch, Datadog or `docker logs`. The container doesn't write log files. `LOG_LEVEL` is `error | warn | log | debug`.

```json
{"level":"log","timestamp":1793799968361,"message":{"message":"request completed","requestId":"d94f39d2-…","method":"POST","path":"/api/payments/callbacks","status":200,"durationMs":14.2},"context":"HTTP"}
```

- **Request id.** Every request gets one (an incoming `X-Request-Id` is reused when well-formed, so it follows a request across services) and it is returned in the response header. It is stored with each callback audit row, so a provider dispute can be traced from a log line to the exact `payment_callbacks` row and back.
- **Error handling.** A global exception filter logs unexpected errors (database failures, bugs) with the stack trace and request id, and returns the client only `{"statusCode":500,"message":"Internal server error"}`. No SQL, table names or stack traces leak. 4xx are logged at `warn`.
- **Audit trail.** `payment_callbacks` records every authenticated callback with its outcome (`APPLIED`, `DUPLICATE`, `NO_CHANGE`, `UNMATCHED`, `CONFLICT`, `REJECTED`, `ERROR`) and the exact payload. Rejected authentication attempts are logged (with provider name and IP, never the credentials) but not stored.
- **Health.** `GET /api/health` is public and returns only `ok`/`down` for the process and database, for load balancers and uptime monitors. It is used by the Docker `HEALTHCHECK`.

**Error monitoring.** [`AGENTS.md`](../AGENTS.md) describes NestJS Observe for traces, errors and metrics (`npx @nestjs/observe link`). It needs an account and hasn't been enabled in this repo, and until `ObserveModule` is registered nothing is sent. Any APM works the same way: attach it at bootstrap and keep the request id on every event.

**What to alert on** (queries over the tables above, or log metrics):

| Signal | Why it matters |
|---|---|
| `payments` in `PENDING` for more than 30 min (`WHERE status='PENDING' AND created_at < NOW() - INTERVAL 30 MINUTE`) | callbacks and reconciliation are both failing, or a provider is down |
| `payments.unapplied_amount > 0` | money was collected that must be refunded |
| `payment_callbacks.outcome` in `CONFLICT`, `REJECTED`, `UNMATCHED` | a provider disagrees with us, or something is wrong with their integration |
| Spike in callback `401`s | a rotated secret, a clock skew > 5 min, or an attack |
| `ERROR` outcomes / 5xx rate | database trouble. Providers will be retrying. |
| Failed health check, or the job logging `Reconciliation pass failed` | |

## 4. Database backups and recovery

Two layers: **nightly logical dumps** (simple, portable, verified) and **binary logs** (replay up to the minute of the failure).

**Backup**: [`scripts/db-backup.sh`](../scripts/db-backup.sh)

```bash
docker compose -f docker-compose.prod.yml --profile ops run --rm backup   # → ./backups/jali-<UTC time>.sql.gz
```

It uses `mysqldump --single-transaction`, a consistent InnoDB snapshot that doesn't lock tables, so payments keep flowing. Output is gzip-compressed, written atomically (`.partial` then rename), accompanied by a `.sha256` checksum, mode `600`, and the credentials are passed through a temporary option file so the password never appears in `ps`. Backups older than `RETENTION_DAYS` (default 14) are pruned locally.

Schedule it nightly (cron, a Kubernetes `CronJob`, or the managed database's own snapshots), and **copy the files offsite** to a different account/region with encryption at rest and a retention policy. A backup on the same disk as the database isn't a backup.

**Restore**: [`scripts/db-restore.sh`](../scripts/db-restore.sh)

```bash
scripts/db-restore.sh backups/jali-20261104T020000Z.sql.gz
```

It verifies the checksum first and makes you type the database name before it overwrites anything. Stop the API (or scale it to 0) first, so nothing writes during the restore.

**Point-in-time recovery.** A nightly dump alone can lose up to 24 h of payments. The `db` service keeps binary logs for 7 days. To recover to just before an incident: restore the last dump, then replay the logs up to the moment before the damage with `mysqlbinlog --stop-datetime='…' | mysql`. For this to be useful in production, ship the binlogs offsite too, or use a managed service whose PITR does it for you.

| Target (suggested, to be agreed with the business) | Value |
|---|---|
| RPO (maximum data loss) | ≤ 5 min with binlog shipping, 24 h with dumps only |
| RTO (time to restore service) | ≤ 1 h |

**Reconcile after any restore.** After restoring, run `POST /api/payments/:id/reconcile` (or just wait for the reconciliation job) so `PENDING` payments are checked against the providers, and compare the providers' settlement reports with `payments` for the affected window.

**Practice it.** A backup is only proven by a restore. Schedule a quarterly restore drill into a scratch database (`CONFIRM=<name> scripts/db-restore.sh …`), and check that row counts and `SUM(applied_amount)` match.

## 5. Secure production configuration

| Area | Setting |
|---|---|
| **Transport** | TLS at the load balancer / reverse proxy (HSTS is sent by helmet). The callback URL given to providers must be `https://`; the config validator enforces this in `http` provider mode. `TRUST_PROXY=1` behind one proxy so logs show real client IPs. |
| **HTTP headers** | `helmet()` on every route (CSP, HSTS, `X-Content-Type-Options`, no `X-Powered-By`, …). The Swagger UI path relaxes only the CSP. |
| **CORS** | Disabled unless `CORS_ORIGINS` lists exact origins (the Next.js app). Only `GET`/`POST`/`PATCH` and the needed headers. Never `*`. |
| **API docs** | Swagger is **off in production** unless `SWAGGER_ENABLED=true`. |
| **Database** | `DB_SYNCHRONIZE=false` (refused at boot otherwise), schema changes only by reviewed migrations. The API connects as `jali_app` with DML rights only. The DB isn't published to the host or internet. Use TLS to a managed database. |
| **Authentication** | Strong `JWT_SECRET`, 8 h tokens, user reloaded each request, one error for unknown user/wrong password/blocked account. Callbacks: token + HMAC + freshness (ARCHITECTURE.md §9). |
| **Input** | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`: unknown fields are rejected. Amounts are validated integers. Parameterized queries only (TypeORM). |
| **Network** | Restrict the callback route to the providers' published IP ranges at the proxy/WAF if they publish them. Add rate limiting there too. |
| **Container** | Non-root, read-only filesystem, capabilities dropped, `no-new-privileges`, resource limits, no secrets in the image or environment. Rebuild regularly for base-image patches, and scan the image in CI (`trivy`, `docker scout`). |
| **Dependencies** | Commit `pnpm-lock.yaml`, install with `--frozen-lockfile`, run `pnpm audit` in CI. |
| **Data** | Phone numbers are masked in logs. Don't log request bodies. Encrypt backups. Restrict who can read `payment_callbacks.payload`. |
| **Time** | Servers run UTC with NTP. A skew larger than 5 min breaks callback authentication. |

## 6. Release checklist

- [ ] `pnpm build && pnpm lint && pnpm test && pnpm test:e2e` are green (e2e needs MySQL: `pnpm docker:test:e2e`, or start the Docker database with `docker compose -f docker-compose.dev.yml up -d db` and run `DB_PORT=3307 pnpm test:e2e`)
- [ ] New migration generated, reviewed, and `migration:generate --check` shows no drift
- [ ] Secrets present in the target environment and ≥ 32 chars. The app refuses to boot otherwise.
- [ ] `PAYMENT_PROVIDER_MODE=http`, provider URLs and `PAYMENT_CALLBACK_URL` set; the provider portal points at that URL with the matching token/secret
- [ ] A fresh backup exists and the last restore drill is recent
- [ ] `/api/health` is green after deploy; a test payment in the provider **sandbox** goes request → callback → balance change
- [ ] Alerts from section 3 are wired up
