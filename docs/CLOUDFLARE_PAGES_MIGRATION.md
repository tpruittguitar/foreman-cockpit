# Cloudflare Pages migration

## Decision

Move the public Pipeline Explorer runtime from Netlify to Cloudflare Pages.

## Goal

Keep the browser app path and user behavior the same while replacing the Netlify function/storage layer with Cloudflare Pages Functions and KV.

## What stays the same

- Public app remains a static browser application.
- Existing Writer key remains the only app access key.
- Browser API path remains `/api/structured`.
- Existing rollback files for Netlify remain in the repository until Cloudflare is proven.

## Cloudflare pieces

- Static hosting: Cloudflare Pages.
- API route: `functions/api/structured/[[path]].js`.
- Snapshot storage: KV namespace bound as `PIPELINE_SNAPSHOT_KV`.
- Cloudflare config: `wrangler.toml`.

## Required Cloudflare setup

1. Create a Cloudflare Pages project connected to the GitHub repository.
2. Build command: `npm run build`.
3. Build output directory: `.`.
4. Create a KV namespace for the structured snapshot.
5. Bind the KV namespace to the Pages project as `PIPELINE_SNAPSHOT_KV`.
6. Either bind the KV namespace in the Cloudflare dashboard, or copy `wrangler.example.toml` values into `wrangler.toml` with real KV IDs.
7. Deploy once.
8. Open the app, use the saved Writer key, and run structured import once from Settings.

## Validation after deploy

- `/api/structured/health` responds.
- Settings -> Seed structured runtime from Writer returns a nonzero job count.
- `/pipeline.html` loads jobs through `/api/structured/jobs`.
- `?src=writer` remains available only if the old Netlify deployment is still available; Cloudflare is the new preferred host.

## Usage rule

Do not run deploy loops. Use one deploy, then inspect the result. If the Pages site fails, fix locally before triggering another deploy.
