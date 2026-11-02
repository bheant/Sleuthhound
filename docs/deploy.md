# Deployment

Sleuthhound deploys to Cloudflare Pages, with Pages Functions for the account API and proxy, and a D1 database for accounts. Everything fits within Cloudflare's free plan.

Requirements: a Cloudflare account, a domain managed by Cloudflare, and Node 20 or later. The examples below use `sleuthhound.net`.

## 1. Configure

Set the site operator for the privacy page in `lib/site.ts`:

```ts
export const OPERATOR = {
  name: "Your company or name",
  email: "privacy@example.com",
};
```

Log in to Wrangler:

```bash
npx wrangler login
```

## 2. Create the D1 database

```bash
npx wrangler d1 create sleuthhound-accounts
```

Copy the `database_id` from the output into `wrangler.toml`, replacing the zeros:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sleuthhound-accounts"
database_id = "<your database id>"
migrations_dir = "d1/migrations"
```

Apply the migrations:

```bash
npx wrangler d1 migrations apply sleuthhound-accounts --remote
```

This creates the `users`, `logins`, `sessions`, `rate_limits` and `invites` tables. Re-run the command before deploying whenever a new migration is added to `d1/migrations/`.

## 3. Create the Pages project

The build command is `npm run build` and the output directory is `out`. Cloudflare picks up `functions/` and the D1 binding from `wrangler.toml` automatically. The build also writes `out/_headers` with the Content-Security-Policy.

Direct upload:

```bash
npx wrangler pages project create sleuthhound --production-branch main
npm run deploy
```

`npm run deploy` builds the site and runs `wrangler pages deploy`.

Git integration:

1. In the Cloudflare dashboard, go to Workers & Pages > Create > Pages > Connect to Git and select the repository.
2. Set the project name to `sleuthhound` and the production branch to `main`.
3. Framework preset: None. Build command: `npm run build`. Output directory: `out`.
4. Add the environment variable `NODE_VERSION=22`.
5. Deploy. Pushes to `main` deploy to production; other branches get preview URLs.

No other environment variables or secrets are needed.

## 4. Custom domain

1. In the Pages project, go to Custom domains > Set up a custom domain and add `sleuthhound.net`. Cloudflare creates the DNS record.
2. Add `www.sleuthhound.net` the same way.
3. Redirect `www` to the apex domain, since the session cookie is tied to one host. In the zone, go to Rules > Redirect Rules and add a rule: when hostname equals `www.sleuthhound.net`, redirect dynamically to `concat("https://sleuthhound.net", http.request.uri.path)` with status 301, preserving the query string.

## 5. HTTPS

1. Wait for both domains to show Active under Custom domains. Certificates are issued automatically.
2. In the zone, enable SSL/TLS > Edge Certificates > Always Use HTTPS.
3. Check:

```bash
curl -sI https://sleuthhound.net | grep -iE '^(HTTP|content-security-policy|strict-transport)'
curl -s https://sleuthhound.net/api/auth/me     # {"ok":true,"user":null}
curl -sI http://sleuthhound.net | head -3       # redirect to https
curl -sI https://www.sleuthhound.net | head -3  # 301 to https://sleuthhound.net/
```

## 6. Create the first admin

Sign-up requires an invite. Create the first one from the command line:

```bash
npm run invite -- you@example.com
```

Sign up using the printed link, then grant the admin role:

```bash
npm run admin:grant -- you@example.com
```

After a reload, Admin appears in the menu. This command is the only way to grant the role. Further invites can be created under Admin > Invites. Each invite is single-use, expires after 7 days, and can be restricted to one email address.

## Free plan limits

| Service | Free allowance | Used for |
| --- | --- | --- |
| Pages | Unlimited static requests, 500 builds per month | The app |
| Pages Functions | 100,000 requests per day, 10 ms CPU per request | Sign-up, log-in, sessions, admin, proxy |
| D1 | 5 GB storage, 5M rows read and 100k rows written per day | Accounts, log-ins, sessions, rate limits |

No KV, R2, Queues, email service or secrets are used. Password stretching happens in the browser, so the heaviest server operation is a SHA-256 hash.

If a daily limit is reached, log-in and the proxy fail until the allowance resets at midnight UTC. The sample workspace and any already unlocked vault keep working.

## Notes

- Companies House keys: Companies House issues REST and JavaScript keys. Because requests come from the browser, a REST key may be rejected. In that case, create a JavaScript key with your site's URL as the JavaScript domain.
- Local preview: `npm run build && npm run preview` serves `out/` with the functions, a local D1 and the `_headers` file on http://127.0.0.1:8788.
- Password resets: Admin > Reset password creates a single-use link valid for 24 hours. There's no email service, so send the link to the user yourself. The user needs their recovery code to keep access to their data; without it, they start with an empty vault.
