# Auth0 access for the sorasukt Admin Center

The Admin Center is available at `https://sorasukt.com/admin/`. Access requires both:

1. a verified account whose email ends exactly with `@sorasukt.com`; and
2. the Auth0 role `admin` in the namespaced ID Token claim `https://sorasukt.com/roles`.

Neither condition grants access by itself.

## Auth0 configuration

1. Open **User Management → Roles** and create the role `admin`.
2. Assign `admin` only to approved staff accounts using an `@sorasukt.com` email.
3. Create a Post-Login Action:

```js
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles || [];
  api.idToken.setCustomClaim("https://sorasukt.com/roles", roles);
};
```

4. Deploy the Action and add it to the **Login** flow.
5. Confirm the Worker variable `AUTH0_ROLES_CLAIM` is `https://sorasukt.com/roles`.
6. Log out and log in again after assigning or removing the role.

## Enforcement

The Worker verifies the Auth0 ID Token, copies the role claim into a signed HttpOnly session, and rechecks the exact email domain plus `admin` role for every `/api/admin/*` request.

Temporary test links never carry an Admin role. They are stored as SHA-256 hashes, limited to Tarot or PangTang, expire after 10–120 minutes, and can be revoked from the Admin Center.
