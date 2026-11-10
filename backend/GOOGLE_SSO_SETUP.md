# Google Workspace sign-in

YDesk supports Google Workspace sign-in for existing active accounts, alongside password sign-in. Google never assigns application roles, creates users, changes passwords, or determines feedback permissions. The backend validates Google's signed identity token, audience, issuer, expiration, verified email, nonce, and Workspace hosted-domain claim.

## Google Cloud

Create a Web application OAuth client in the company's Google Cloud organization. Configure an Internal audience and request only `openid`, `email`, and `profile`.

For production:

- JavaScript origin: `https://ydesk.theyellow.network`
- Redirect URI: `https://internaltyn.onrender.com/api/auth/google/callback`

Keep the downloaded client JSON and client secret out of Git and frontend variables. The standard client must be created in the Google Cloud Console; `gcloud iam oauth-clients` manages Workforce Identity Federation clients and is not the same product.

## Render environment

```env
GOOGLE_CLIENT_ID=<web client ID>
GOOGLE_CLIENT_SECRET=<web client secret>
GOOGLE_REDIRECT_URI=https://internaltyn.onrender.com/api/auth/google/callback
GOOGLE_WORKSPACE_DOMAINS=theyellow.network
FRONTEND_URL=https://ydesk.theyellow.network
```

`GOOGLE_WORKSPACE_DOMAINS` is a comma-separated list of accepted Google Workspace `hd` values, rather than an email-suffix check. Google sign-in remains hidden and unavailable until all required settings are valid. No Google variables or secrets are required in Vercel; the login page reads an enablement-only backend endpoint.

## Existing account mapping

The first successful Google login matches an existing YDesk login email or an administrator-approved `googleLoginEmail`. It binds the stable Google `sub` identifier; later sign-ins use that identifier, even if the Workspace email changes. Inactive, unknown, ambiguous, or already differently linked identities are rejected. Email addresses used only for weekly delivery do not grant sign-in access.

To map a different Workspace address to an existing account without duplicating its data or changing its password:

```sh
node scripts/set-google-login-email.js existing-login@company.example workspace-address@company.example
```

Use `none` as the second argument to remove the alias. An existing Google subject binding is not replaced by this script; changing Google identities requires a separately verified administrative operation.

## Session behavior

The flow uses an HTTP-only SameSite=Lax state cookie, a single-use server-side state record, nonce validation, and PKCE. After Google verification, the backend redirects to the fixed frontend callback with a 60-second single-use code in the URL fragment. The browser exchanges it using a proof kept in that tab's session storage. Access tokens, refresh tokens, and Google credentials are never placed in redirect URLs. The frontend removes the fragment immediately.

Google and password sign-ins share the same YDesk access-token issuance, refresh-cookie rotation, and audit handling. Sign-out, password changes, and administrator session revocation invalidate Google handoffs as well as existing sessions. Password login remains available.

Run `npm test` from `backend` for isolated provider-stubbed security tests. Final real Workspace authentication must be completed in a browser by the account owner. Tests do not send emails.
