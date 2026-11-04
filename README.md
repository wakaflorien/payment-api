# Jali loan API: NestJS practice

```bash
pnpm docker:dev             # MySQL + API in Docker (or run natively: see "Running it" below)
pnpm docker:test:e2e        # all tests fail at first; make them pass step by step
```

- API docs (Swagger UI): http://localhost:3000/api/docs. Raw OpenAPI JSON: `/api/docs-json`.
  Log in with `POST /api/auth/login`, click **Authorize**, then paste the `accessToken`.
- **Insomnia:** see [Using Insomnia](#using-insomnia) below.
- Replace this README with your own in Step 6.

## Running it: Docker or native

Both read the same `.env` (copy `.env.example` to start), use the same database credentials, and can be switched between at any time. **Docker is the recommended way**: nothing to install except Docker, and every developer gets the same MySQL.

### With Docker (recommended)

```bash
cp .env.example .env
pnpm docker:dev        # MySQL + the API with hot reload: http://localhost:3000/api/docs
pnpm docker:seed       # admin@ / officer@ / auditor@jali.rw, password secret-pass (once)
pnpm docker:test:e2e   # the e2e suite, inside the container
pnpm docker:dev:down   # stop (data is kept)      pnpm docker:reset   # stop and wipe the database
```

Edit files normally: `tsc --watch` recompiles and the app restarts on save (a compile error leaves the running app up). The Node inspector is exposed on `localhost:9229`. After changing `package.json`, restart with `pnpm docker:dev` (it re-runs `pnpm install` inside the container).

### Natively

```bash
brew services start mysql   # your own MySQL on 3306, with the jali / jali_test databases
pnpm start:dev              # http://localhost:3000/api
pnpm test:e2e
```

### Native app + Docker database

Don't want to install MySQL, but prefer running Node yourself? Start only the database in Docker:

```bash
docker compose -f docker-compose.dev.yml up -d db   # MySQL on localhost:3307 (creates `jali` and `jali_test`)
DB_PORT=3307 pnpm start:dev         # or put DB_PORT=3307 in .env
DB_PORT=3307 pnpm test:e2e
docker compose -f docker-compose.dev.yml down       # stop it (or `pnpm docker:reset` to wipe the data)
```

The Docker database listens on **3307** so it never collides with a MySQL you already run on 3306. If you stop that one, set `DOCKER_DB_PORT=3306` and everything works with the default `DB_PORT`. Only one API can use port 3000 at a time: stop one before starting the other, or set `API_PORT`.

> The Docker API always listens on 3000 *inside* the container (`PORT` in `.env` is ignored there); `API_PORT` chooses the host port.

## Payments (MTN / Airtel mobile money)

How it works, with diagrams, the reliability cases and the failure/retry matrix: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Production setup (secrets, Docker, logs, backups, hardening): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Try it end to end with the built-in simulator (`PAYMENT_PROVIDER_MODE=simulator`, the default). Log in as `officer@jali.rw` to get `$TOKEN`, then:

```bash
# 1. Ask MTN to collect 20,000 RWF. This creates a PENDING payment and returns its transactionId.
curl -s -X POST localhost:3000/api/loans/1/payment-requests \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"provider":"MTN","amount":20000}'

# 2. Play the provider: send the signed callback (3 times, to see idempotency).
pnpm callback:send MTN <transactionId> 20000 SUCCESS 3

# 3. The loan balance dropped once; every attempt is listed.
curl -s localhost:3000/api/loans/1/payments -H "Authorization: Bearer $TOKEN"
```

The callback endpoint and its authentication headers (`Authorization: Bearer`, `X-Timestamp`, `X-Signature`) are documented in Swagger under *provider callbacks*. The request body is exactly the one from the brief:

```json
{ "provider": "MTN", "transaction_id": "MTNN848", "amount": "43433434", "currency": "RWF",
  "status": "SUCCESS", "timestamp": "2026-10-30T10:30:00Z" }
```

Database changes ship as migrations (`pnpm migration:run`, `pnpm migration:generate src/database/migrations/Name`). `DB_SYNCHRONIZE=true` is for local development only; production refuses to start with it.

## Roles (RBAC)

`pnpm seed` creates one staff account per role. The password for all three is `secret-pass`.

| Role | Login | Allowed to |
|---|---|---|
| `admin` | `admin@jali.rw` | Everything, including `/api/users` (create staff, change roles, block accounts) |
| `loan_officer` | `officer@jali.rw` | Create and list customers, disburse and view loans, record repayments |
| `auditor` | `auditor@jali.rw` | Read-only: list customers, view loans, the portfolio report |

How it works:
- Two global guards are registered in `auth.module.ts`. `JwtAuthGuard` returns 401 when there's no valid token. `RolesGuard` returns 403 when the role isn't allowed.
- Every route needs a token unless it's marked `@Public()`. `@Roles(...)` on a route lists who may call it.
- The guard reloads the user on every request. A role change or a block takes effect on the **next request**, not when the token expires.
- Admins can't demote or block themselves (422).
- `test/jali/rbac.e2e-spec.ts` checks every role against every route.

## Using Insomnia

1. Go to **Import**, choose `jali.insomnia.json`, and import it as a **Collection**.
2. In the environment dropdown at the top left, pick **Admin**, **Loan officer** or **Auditor**.
3. Send **Auth → Login**. Every other request reuses its token automatically, through Insomnia's `{% response %}` chaining. No scripts are needed.
4. Run **Create customer**, then **Disburse loan**, then **Record repayment**. Each request picks up the id from the previous response.
5. To see the 403s, switch to **Auditor**, send **Login** again, and retry a write request.

`customerId`, `loanId` and `userId` always come from the *last* response of their "create" request. Phone and national ID must be unique, so edit them to create a second customer.
# payment-api
