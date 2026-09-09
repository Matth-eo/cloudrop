# Cognito setup for Cloudrop

Cloudrop uses Cognito User Pools managed sign-up/sign-in pages. Passwords and verification codes are handled by Cognito. No identity pool, Amplify, custom authentication Lambda, or additional AWS service is needed.

## AWS Console: User Pool and app client

1. In **Amazon Cognito → User pools**, create a user pool. Choose **Traditional web application** for the app type and name the app `Cloudrop`.
2. Enable **email** sign-in, self-service sign-up, and email verification. Use Cognito's built-in email delivery for initial testing. Let Cognito handle password requirements, confirmation, and password recovery. Do not configure Lambda triggers.
3. Create a confidential app client with a **client secret**. Record the user pool ID, app client ID, and app client secret for the server environment.
4. Under the pool's domain/branding settings, create a Cognito domain. Record the full HTTPS origin, for example `https://YOUR_PREFIX.auth.us-east-1.amazoncognito.com`.
5. Open the app client's **Login pages / Managed login** settings. Enable Cognito User Pool sign-in and the **Authorization code grant**. Enable OAuth scopes **openid** and **email**. Do not enable the implicit or client-credentials grant for this app.
6. Set the allowed callback URL to `http://localhost:3000/auth/callback` and the allowed sign-out URL to `http://localhost:3000/`. Add corresponding HTTPS URLs for deployment. They must match exactly, including paths and trailing slash on the sign-out URL.
7. Set the ID token validity to **1 hour**. Save the settings and ensure the app client has its managed login page/branding available. The app sends PKCE S256, state, and nonce automatically.

Console section labels may differ between managed login and the classic hosted UI. The required configuration is the same: a User Pool app client with a domain, code grant, client secret, openid/email scopes, callback URL, and sign-out URL.

## Server environment

Add these names to the existing git-ignored `.env.local`, using your actual values:

```dotenv
APP_URL=http://localhost:3000
COGNITO_DOMAIN=https://YOUR_PREFIX.auth.us-east-1.amazoncognito.com
COGNITO_USER_POOL_ID=us-east-1_YOUR_POOL_ID
COGNITO_CLIENT_ID=YOUR_APP_CLIENT_ID
COGNITO_CLIENT_SECRET=YOUR_APP_CLIENT_SECRET
```

Use `APP_URL=https://your-deployed-host` in production. URL settings are origins, without a path. Restart Next.js after changing configuration. Keep the existing S3/DynamoDB AWS variables. Do not use `NEXT_PUBLIC_` for any of these values and do not commit `.env.local`.

The Cognito domain and client ID necessarily appear in login redirects; the client secret, AWS secret access key, and token-exchange configuration remain server-side. The web app's IAM credentials do not need Cognito administration permissions for this OAuth flow.

## AWS Console: DynamoDB ownership index

On the existing metadata table, create a **global secondary index**:

| Setting | Value |
| --- | --- |
| Index name | `userId-index` |
| Partition key | `userId` (String) |
| Sort key | `uploadedAt` (String) |
| Projected attributes | All |

Keep the table's existing `fileId` partition key unchanged. Wait for the index status to become **Active**. Add `dynamodb:Query` permission on `arn:aws:dynamodb:REGION:ACCOUNT_ID:table/TABLE_NAME/index/userId-index` to the web app's existing IAM policy. Retain its GetItem and PutItem table permissions and existing S3 permissions. The Lambda cleanup role and hourly Scheduler role need no changes.

The new `userId` attribute stores the verified Cognito `sub`, not an email or browser-supplied ID. New uploads sign this ID into S3 metadata as `owner-id`; completion checks that it matches the signed-in user before saving. Conditional retries also verify the existing record's owner.

Old records without `userId` are not in the ownership index and are never assigned to whoever opens their link. Their public `/d/[fileId]` links keep working until expiry. In-flight uploads started before this change without owner metadata cannot be claimed through the completion endpoint.

## Sessions and public sharing

- Sign up opens Cognito's `/signup` page; sign in uses the authorization endpoint. The callback exchanges a one-use authorization code on the server, verifies the JWT signature, User Pool issuer, client ID, token use, expiry, and nonce, and checks the OAuth state/PKCE flow.
- Sessions use the verified ID token in an HttpOnly, SameSite=Lax cookie. HTTPS uses Secure and `__Host-` cookies. Localhost HTTP is supported for development. Tokens are never placed in localStorage or exposed to client JavaScript.
- Sessions end at ID token expiry (one hour with the suggested settings). There is deliberately no silent refresh-token storage or background renewal in this focused version. Sign in again when prompted. For a session expiring during upload, the UI offers sign-in in a new tab so saving can be retried without losing the selected file.
- Sign out is a same-origin POST that clears Cloudrop's cookies and redirects through Cognito logout to clear its managed-login session. This does not revoke sessions on other devices; offline JWT validation can accept an already-issued token until expiry.
- Upload signing/completion require a valid session and a matching Origin header. `/my-uploads` derives the owner from that session and queries only their index partition. The index is eventually consistent, so new uploads may take a moment to appear. The simple list follows all query pages; add UI pagination if accounts grow large.
- `/d/[fileId]` remains public. It checks file expiry and creates a short-lived S3 download redirect without requiring a session. The S3 bucket stays private. File expiry, cleanup, and EventBridge scheduling are unchanged.

## Verification

Run `node --test tests/auth.test.mjs tests/expiration.test.mjs lambda/cleanup/cleanup.test.mjs`, `npm run lint`, and `npm run build`.

After console setup, test sign-up/email confirmation, sign-in, an upload, My uploads, and sign-out. Sign in as a second user to check their list is separate. Open the first user's `/d/[fileId]` link in a private browser window to confirm anonymous downloading still works. Never paste tokens or credentials into test logs.

References: [Cognito authorization and PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html), [JWT verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html), [managed sign-up pages](https://docs.aws.amazon.com/cognito/latest/developerguide/managed-login-endpoints.html), [logout](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html).
