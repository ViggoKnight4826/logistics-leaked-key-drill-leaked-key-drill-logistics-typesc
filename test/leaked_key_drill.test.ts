import assert from "node:assert/strict";
import test from "node:test";
import type { DrillApi } from "../src/infrai_client.js";
import { runLeakedKeyDrill } from "../src/leaked_key_drill.js";

test("closes overlap immediately when signed delivery evidence is exposed", async () => {
  const calls: string[] = [];
  let graceHours = -1;
  const api: DrillApi = {
    async createTemporaryKey() {
      calls.push("create");
      return { id: "key_drill_42", key: "temporary-value" };
    },
    async reportCompromise() {
      calls.push("report");
    },
    async searchLogs() {
      calls.push("search");
      return [
        {
          message: "proof retrieved for shipment shp_9",
          level: "info",
          timestamp: "2026-09-29T09:05:00.000Z",
          service: "dispatch-api",
          environment: "production",
          trace_id: "trace_9",
        },
      ];
    },
    async rotateKey(_keyId, input) {
      calls.push("rotate");
      graceHours = input.grace_hours;
    },
    async revokeKey() {
      calls.push("revoke");
    },
  };

  const result = await runLeakedKeyDrill(api, {
    incidentId: "inc_42",
    service: "dispatch-api",
    environment: "production",
    suspectedAt: "2026-09-29T10:00:00.000Z",
    windowStartedAt: "2026-09-29T08:00:00.000Z",
    shipmentEvents: [
      { shipmentId: "shp_9", kind: "delivered", occurredAt: "2026-09-29T08:30:00.000Z" },
    ],
    proofOfDeliveryFiles: [
      { shipmentId: "shp_9", objectKey: "pod/shp_9.pdf", containsSignature: true },
    ],
    exceptionSummary: "credential appeared in a build transcript",
  });

  assert.equal(graceHours, 0);
  assert.deepEqual(result.decision.exposedShipmentIds, ["shp_9"]);
  assert.deepEqual(result.matchedTraceIds, ["trace_9"]);
  assert.deepEqual(calls, ["create", "report", "search", "rotate", "revoke"]);
});
