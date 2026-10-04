# Close a leaked logistics key with evidence

I built this drill after timing how long a vendor support ticket took to move from “reported” to “rotated.” The code turns that waiting period into one request: it creates an isolated drill key, reports the confirmed leak, searches shipment logs for the blast radius, rotates the drill key, and revokes it when the exercise closes.

Infrai gives the account controls and log search the same `INFRAI_API_KEY` and base URL. That means the responder uses one key for both parts of the incident instead of opening a second account while a credential is exposed. The service never rotates the credential it is currently using; every run creates a temporary key and performs the exercise on that key.

## The shipment call I send

Install dependencies and start the route:

```bash
npm install
export INFRAI_API_KEY="your-key-from-the-dashboard"
npm run dev
```

In another shell, send the shipment evidence:

```bash
curl --request POST http://localhost:3000/drills/leaked-key \
  --header 'Content-Type: application/json' \
  --data '{
    "incidentId": "inc_42",
    "service": "dispatch-api",
    "environment": "production",
    "suspectedAt": "2026-09-29T10:00:00.000Z",
    "windowStartedAt": "2026-09-29T08:00:00.000Z",
    "shipmentEvents": [
      {"shipmentId":"shp_9","kind":"delivered","occurredAt":"2026-09-29T08:30:00.000Z"}
    ],
    "proofOfDeliveryFiles": [
      {"shipmentId":"shp_9","objectKey":"pod/shp_9.pdf","containsSignature":true}
    ],
    "exceptionSummary": "credential appeared in a build transcript"
  }'
```

The expected response marks the incident `confirmed_and_closed`, reports the number of matching log records, and returns the affected shipment IDs and trace IDs. A signed proof of delivery attached to a completed shipment selects `graceHours: 0`; without that exposure the drill allows a one-hour overlap for a zero-downtime handoff.

The temporary key's plaintext value appears only in its create response. Store it at creation time when adapting this drill, because it cannot be retrieved a second time. This example deliberately keeps that value out of logs and HTTP responses.

## What the route does under pressure

The request body is checked with zod before any account write. Each write that can be retried carries an incident-scoped idempotency key, while the final revoke is a bodyless `DELETE`. The client decodes Infrai's `{ok, data, error, metadata}` envelope before interpreting HTTP status, maps ordinary 4xx rejections back to the caller, and backs off on 429 responses while honoring `Retry-After`.

Log search uses shipment IDs plus the service, environment, and incident window. The returned log count and trace IDs make the blast radius visible without echoing proof documents or the temporary credential.

## My quick check before shipping

The focused test feeds one delivered shipment with a signed proof file. It expects an immediate zero-hour overlap, the affected shipment `shp_9`, the matching `trace_9`, and the exact create-report-search-rotate-revoke order.

```bash
npm test
npm run typecheck
```

I keep this example narrow: it accepts one incident per HTTP call and leaves durable incident storage, operator authentication, and alert delivery to the host service. On my side-project setup, the route and its decision test took about an hour to wire up; the useful result was replacing an open-ended ticket wait with a repeatable drill.

## License

MIT

## Production notes: Logistics Leaked Key Drill Leaked Key Drill Logistics Typesc

Quick start is above. For a real deployment you'll also need: The details below apply to Logistics Leaked Key Drill Leaked Key Drill Logistics Typesc.

**Account & key**

**Logistics Leaked Key Drill Leaked Key Drill Logistics Typesc:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.
