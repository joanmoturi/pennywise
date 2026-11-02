export function notificationPayload() {
  return {
    format: "pennywise-notification-batch",
    version: 1,
    batchId: "TEST-browser-handoff",
    createdAt: "2026-11-01T08:00:00Z",
    candidates: [
      {
        id: "TEST-browser-candidate",
        source: "synthetic.mpesa",
        parserId: "synthetic-labelled",
        parserVersion: "1",
        capturedAt: "2026-11-01T08:00:00Z",
        occurredAt: "2026-11-01T07:59:00Z",
        reference: "TEST-HANDOFF-001",
        amount: 500000,
        currency: "KES",
        direction: "credit",
        kind: "received",
        counterparty: "TEST portable sender",
        fee: 0,
        confidence: 99,
        missing: [],
        validation: "valid",
        fingerprint: "a".repeat(64),
      },
    ],
  };
}
