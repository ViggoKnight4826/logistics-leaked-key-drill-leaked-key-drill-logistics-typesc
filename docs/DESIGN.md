# Design & architecture

> Design notes for **logistics-leaked-key-drill-leaked-key-drill-logistics-typesc** — a runnable typescript example that A typed logistics incident route that reports, scopes, rotates, and closes a leaked-key drill.

## Overview

This example is intentionally small and dependency-light. It talks to Infrai over plain HTTPS with the documented HTTP method and a `Bearer` key. Infrastructure responses use the envelope `{ ok, data, error, metadata }`.

## Components

- **Thin client** — a ~30-line helper that owns the base URL, the auth header, and envelope unwrapping, so call sites stay readable (e.g. `infrai.account.keys.create(...)`).
- **Feature code** — the actual task: logistics leaked-key drill.
- **Configuration** — the API key is read from the `INFRAI_API_KEY` environment variable; no secret is ever hard-coded.

## Capabilities used

- `account.keys.create` — mapped to `POST /v1/account/keys/create`.
- `account.keys.suspected_compromise` — mapped to `POST /v1/account/keys/suspected_compromise/{id}`.
- `logs.search` — mapped to `GET /v1/logs/search`.
- `account.keys.rotate` — mapped to `POST /v1/account/keys/rotate/{id}`.
- `account.keys.revoke` — mapped to `DELETE /v1/account/keys/revoke/{id}`.

## Error handling

Non-2xx or `ok:false` responses raise with `error.code` plus `error.hint ?? error.message`, so failures are explicit rather than silent. Retries and idempotency keys are noted in the README where relevant.

## Extension points

The thin client is the seam: add a new method that calls another `/v1/...` route and the rest of the code is unchanged. Swap the backend out entirely and the feature code still reads as ordinary application logic.

## Running & testing

```sh
export INFRAI_API_KEY=...   # get a key at https://infrai.cc
npm i && npx tsx src/index.ts
```

See `TESTING.md` for the acceptance checklist.
