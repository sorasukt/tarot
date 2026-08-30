# Tarot Admin Console

The admin console is served from `/tarot/admin/` and uses the existing Auth0 web session.

## Access control

Admin API routes are under `/api/admin/*`. Access is denied unless the authenticated session matches one of these Worker vars:

- `ADMIN_USER_SUBS` — comma-separated Auth0 user `sub` values (recommended)
- `ADMIN_EMAILS` — comma-separated email allowlist (fallback)

If both values are empty, nobody can access the admin API.

For production deployments, the workflow reads GitHub Actions repository variables with the same names and injects them into the generated Wrangler configuration.

## D1 migration

Migration `0008_admin_console.sql` creates:

- `support_cases`
- `support_case_notes`
- `admin_audit_log`

The existing deployment workflow applies D1 migrations before deploying the Worker.

## Current modules

- Overview metrics
- Payments history
- Membership/subscription status
- Customer/member lookup
- Customer support case management
- Admin audit history
- Link to Stripe Dashboard for advanced payment operations

All admin data operations go through the Worker API. Stripe secret keys are never exposed to the browser.
