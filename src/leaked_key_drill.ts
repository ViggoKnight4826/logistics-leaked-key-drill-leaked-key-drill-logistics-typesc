import { z } from "zod";
import type { DrillApi, LogHit } from "./infrai_client.js";

const shipmentEventSchema = z.object({
  shipmentId: z.string().min(1),
  kind: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
  occurredAt: z.string().datetime(),
});

const proofOfDeliverySchema = z.object({
  shipmentId: z.string().min(1),
  objectKey: z.string().min(1),
  containsSignature: z.boolean(),
});

export const leakedKeyDrillSchema = z
  .object({
    incidentId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    service: z.string().min(1),
    environment: z.string().min(1),
    suspectedAt: z.string().datetime(),
    windowStartedAt: z.string().datetime(),
    shipmentEvents: z.array(shipmentEventSchema).min(1),
    proofOfDeliveryFiles: z.array(proofOfDeliverySchema),
    exceptionSummary: z.string().min(1),
  })
  .refine((value) => Date.parse(value.windowStartedAt) <= Date.parse(value.suspectedAt), {
    message: "windowStartedAt must be before suspectedAt",
    path: ["windowStartedAt"],
  });

export type LeakedKeyDrillInput = z.infer<typeof leakedKeyDrillSchema>;

export type DrillDecision = {
  graceHours: number;
  exposedShipmentIds: string[];
  reason: string;
};

export function decideRotation(input: LeakedKeyDrillInput): DrillDecision {
  const delivered = new Set(
    input.shipmentEvents
      .filter((event) => event.kind === "delivered")
      .map((event) => event.shipmentId),
  );
  const exposedShipmentIds = [
    ...new Set(
      input.proofOfDeliveryFiles
        .filter((file) => file.containsSignature && delivered.has(file.shipmentId))
        .map((file) => file.shipmentId),
    ),
  ].sort();

  if (exposedShipmentIds.length > 0) {
    return {
      graceHours: 0,
      exposedShipmentIds,
      reason: "signed delivery evidence belongs to a completed shipment",
    };
  }
  return {
    graceHours: 1,
    exposedShipmentIds,
    reason: "no signed delivery evidence was linked to a completed shipment",
  };
}

export type DrillResult = {
  incidentId: string;
  status: "confirmed_and_closed";
  searchedLogCount: number;
  matchedTraceIds: string[];
  decision: DrillDecision;
};

export async function runLeakedKeyDrill(
  api: DrillApi,
  rawInput: unknown,
): Promise<DrillResult> {
  const input = leakedKeyDrillSchema.parse(rawInput);
  const decision = decideRotation(input);
  const temporary = await api.createTemporaryKey({
    project_id: input.projectId,
    name: `leak-drill-${input.incidentId}`,
    scopes: ["logs:read"],
    idempotency_key: `${input.incidentId}-create`,
  });

  let hits: LogHit[] = [];
  try {
    // The plaintext temporary.key is returned only now; a real holder must store it immediately.
    await api.reportCompromise(temporary.id, {
      confirmed_leak: true,
      auto_rotate: false,
    });
    hits = await api.searchLogs({
      q: input.shipmentEvents.map((event) => event.shipmentId).join(" OR "),
      service: input.service,
      environment: input.environment,
      since: input.windowStartedAt,
      until: input.suspectedAt,
      limit: 100,
    });
    await api.rotateKey(temporary.id, {
      grace_hours: decision.graceHours,
      idempotency_key: `${input.incidentId}-rotate`,
    });
  } finally {
    await api.revokeKey(temporary.id);
  }

  return {
    incidentId: input.incidentId,
    status: "confirmed_and_closed",
    searchedLogCount: hits.length,
    matchedTraceIds: [...new Set(hits.flatMap((hit) => (hit.trace_id ? [hit.trace_id] : [])))],
    decision,
  };
}
