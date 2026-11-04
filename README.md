# Jali loan API: NestJS practice

Start with **[PRACTICE_BRIEF.md](PRACTICE_BRIEF.md)** and set a 90-minute timer.

```bash
brew services start mysql   # if MySQL isn't running
pnpm test:e2e               # all tests fail at first; make them pass step by step
pnpm start:dev              # http://localhost:3000/api
```

- API docs (Swagger UI): http://localhost:3000/api/docs. Raw OpenAPI JSON: `/api/docs-json`.
  Log in with `POST /api/auth/login`, click **Authorize**, then paste the `accessToken`.
- **Insomnia:** see [Using Insomnia](#using-insomnia) below.
- Replace this README with your own in Step 6.

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
