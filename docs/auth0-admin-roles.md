# Auth0 roles for Tarot Admin Console

The Admin Console uses Auth0 roles carried in the namespaced ID Token claim `https://sorasukt.com/roles`.

## Recommended roles

| Role | Access |
| --- | --- |
| `admin` | Full Admin Console access, support write access, audit log, and Stripe Dashboard handoff |
| `support` | Dashboard overview, customer lookup, support case read/write |
| `billing` | Dashboard overview, payments, memberships, customer lookup, Stripe Dashboard handoff |
| `viewer` | Read-only overview, payments, memberships, customers, and support cases |

A user may have more than one role. Permissions are combined server-side.

## Auth0 configuration

1. In Auth0 Dashboard, create the roles `admin`, `support`, `billing`, and `viewer`.
2. Create a Post-Login Action with the following code:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://sorasukt.com';
  const roles = event.authorization?.roles || [];
  api.idToken.setCustomClaim(`${namespace}/roles`, roles);
};
```

3. Deploy the Action and add it to the Login flow.
4. Assign one or more roles to staff users in Auth0.
5. Staff must log out and log in again after a role is changed so the signed Tarot session receives the new roles.

## Enforcement

The Worker verifies the Auth0 ID Token, copies the roles claim into the signed HttpOnly session, and checks permissions again for every `/api/admin/*` request. Hiding a navigation item in the browser is not considered authorization.

The claim name can be changed with `AUTH0_ROLES_CLAIM`, but the Auth0 Action and Worker configuration must use the same value.
