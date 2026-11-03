import { useEffect, useState } from "react";
import { useApp, type Field } from "./context";
import { today, uid } from "./domain";
import { formatMoney } from "./money";
import { download } from "./storage";
import { stagedHandoffs, discardHandoff } from "./handoff";
import {
  ingestNotifications,
  parseNotificationBatch,
  mappedAccount,
  approveNotification,
  amendNotification,
  simulateNotification,
  resolveNotificationConflict,
} from "./notifications";
import {
  approvalRuleSchema,
  sourceMappingSchema,
  classifications,
  candidateKinds,
  type InboxRecord,
  type NotificationCandidate,
  type NotificationBatch,
  type ApprovalRule,
} from "./notification-schema";
import { Button, Card, PageHead, Table, Badge, errorMessage } from "./ui";

export function NotificationInbox() {
  const app = useApp();
  const s = app.state;
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [batch, setBatch] = useState<NotificationBatch>();
  const [pendingId, setPendingId] = useState("");
  const [shares, setShares] = useState<
    Awaited<ReturnType<typeof stagedHandoffs>>
  >([]);
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [simulation, setSimulation] = useState("");
  async function refreshShares() {
    try {
      setShares(await stagedHandoffs());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void refreshShares();
    const refresh = () => void refreshShares();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const accounts = s.accounts.map((a) => ({ value: a.id, label: a.name }));
  const postingFields: Field[] = [
    {
      key: "classification",
      label: "Financial classification",
      type: "select",
      options: classifications.map((v) => ({
        value: v,
        label: v.replaceAll("_", " "),
      })),
    },
    {
      key: "accountId",
      label: "Account (source for owned transfer)",
      type: "select",
      options: accounts,
    },
    { key: "category", label: "Category" },
    {
      key: "destinationId",
      label: "Owned transfer destination",
      type: "select",
      required: false,
      options: accounts,
    },
    {
      key: "relatedId",
      label: "Related receivable, liability or bond",
      type: "select",
      required: false,
      options: [
        ...s.receivables.map((r) => ({
          value: r.id,
          label: `Receivable: ${r.name}`,
        })),
        ...s.liabilities.map((r) => ({
          value: r.id,
          label: `Liability: ${r.name}`,
        })),
        ...s.bonds.map((r) => ({ value: r.id, label: `Bond: ${r.name}` })),
      ],
    },
    {
      key: "originalTransactionId",
      label: "Original transaction for reversal",
      type: "select",
      required: false,
      options: s.transactions
        .filter((t) => !t.reversalOf)
        .slice(-200)
        .map((t) => ({
          value: t.id,
          label: `${t.date}: ${t.description} (${formatMoney(t.amount, s.settings.currency)})`,
        })),
    },
  ];
  const postingValues = (values: Record<string, unknown>) => ({
    classification: values.classification,
    accountId: values.accountId,
    category: values.category,
    ...(values.destinationId ? { destinationId: values.destinationId } : {}),
    ...(values.relatedId ? { relatedId: values.relatedId } : {}),
    ...(values.originalTransactionId
      ? { originalTransactionId: values.originalTransactionId }
      : {}),
  });
  function editMapping(id?: string) {
    const previous = s.notifications.sources.find((v) => v.id === id);
    app.dialog({
      title: previous ? "Edit source mapping" : "Map companion source",
      description:
        "Copy the exact source ID from the imported candidate. SMS sources start with sms.s; legacy source IDs remain valid. Multiple mappings require an exact account hint; ambiguous mappings never auto-post.",
      fields: [
        { key: "name", label: "Display name" },
        { key: "source", label: "Companion source ID" },
        {
          key: "accountId",
          label: "Pennywise account",
          type: "select",
          options: accounts,
        },
        {
          key: "accountHint",
          label: "Account hint (optional)",
          required: false,
        },
        { key: "enabled", label: "Enable mapping", type: "checkbox" },
        {
          key: "trusted",
          label: "Trust this selected source for rule automation",
          type: "checkbox",
        },
      ],
      values: previous
        ? { ...previous }
        : {
            enabled: true,
            trusted: false,
            accountId: accounts[0]?.value,
            accountHint: "",
          },
      submit: async (v) => {
        const mapping = sourceMappingSchema.parse({
          ...v,
          id: previous?.id ?? uid(),
        });
        await app.mutate("Save notification source mapping", (state) => {
          state.notifications.sources = state.notifications.sources.filter(
            (m) => m.id !== mapping.id,
          );
          state.notifications.sources.push(mapping);
        });
      },
    });
  }
  function editRule(previous?: ApprovalRule) {
    app.dialog({
      title: previous ? "Edit approval rule" : "Create approval rule",
      description:
        "New rules are disabled by default. Simulate before enabling. Incoming automation requires an exact known counterparty. Conflicting rules always hold for review.",
      fields: [
        { key: "name", label: "Rule name" },
        { key: "source", label: "Exact companion source ID" },
        {
          key: "kind",
          label: "Transaction candidate type",
          type: "select",
          options: candidateKinds.map((v) => ({ value: v, label: v })),
        },
        {
          key: "direction",
          label: "Direction",
          type: "select",
          options: ["credit", "debit", "unknown"].map((v) => ({
            value: v,
            label: v,
          })),
        },
        { key: "minimum", label: "Minimum amount", type: "money" },
        { key: "maximum", label: "Maximum amount", type: "money" },
        {
          key: "counterparty",
          label: "Exact known counterparty (optional)",
          required: false,
        },
        {
          key: "confidence",
          label: "Minimum confidence (90–100)",
          type: "number",
        },
        { key: "priority", label: "Priority (1 is highest)", type: "number" },
        {
          key: "referenceRequired",
          label: "Require transaction reference",
          type: "checkbox",
        },
        {
          key: "action",
          label: "Rule action",
          type: "select",
          options: ["approve", "categorise", "assign", "hold", "reject"].map(
            (v) => ({ value: v, label: v }),
          ),
        },
        ...postingFields,
        { key: "enabled", label: "Enable this rule", type: "checkbox" },
      ],
      values: previous
        ? { ...previous, ...previous.posting }
        : {
            source,
            kind: "merchant",
            direction: "debit",
            minimum: 1,
            maximum: 100000,
            counterparty: "",
            confidence: 95,
            priority: 10,
            referenceRequired: true,
            enabled: false,
            action: "hold",
            classification: "expense",
            category: "Uncategorised",
            accountId: accounts[0]?.value,
          },
      submit: async (v) => {
        const next = approvalRuleSchema.parse({
          id: previous?.id ?? uid(),
          version: (previous?.version ?? 0) + 1,
          name: v.name,
          enabled: v.enabled,
          priority: v.priority,
          source: v.source,
          kind: v.kind,
          direction: v.direction,
          minimum: v.minimum,
          maximum: v.maximum,
          counterparty: v.counterparty,
          referenceRequired: v.referenceRequired,
          confidence: v.confidence,
          action: v.action,
          posting: postingValues(v),
          createdAt: previous?.createdAt ?? new Date().toISOString(),
          matchCount: previous?.matchCount ?? 0,
          ...(previous?.lastMatchedAt
            ? { lastMatchedAt: previous.lastMatchedAt }
            : {}),
        });
        await app.mutate("Save notification approval rule version", (state) => {
          state.notifications.rules = state.notifications.rules.filter(
            (r) => r.id !== next.id,
          );
          state.notifications.rules.push(next);
        });
      },
    });
  }
  function editCandidate(record: InboxRecord) {
    const c = record.amended ?? record.candidate;
    app.dialog({
      title: "Correct extracted details",
      description:
        "Original capture and fingerprint remain preserved. A failed or balance-only original cannot become a completed transaction.",
      fields: [
        { key: "amount", label: "Amount", type: "money" },
        {
          key: "currency",
          label: "Currency",
          type: "select",
          options: ["KES", "USD", "EUR", "GBP"].map((v) => ({
            value: v,
            label: v,
          })),
        },
        { key: "occurredAt", label: "Original timestamp (ISO with timezone)" },
        { key: "reference", label: "Reference (optional)", required: false },
        {
          key: "counterparty",
          label: "Counterparty (optional)",
          required: false,
        },
        {
          key: "direction",
          label: "Direction",
          type: "select",
          options: ["credit", "debit"].map((v) => ({ value: v, label: v })),
        },
        {
          key: "kind",
          label: "Transaction candidate type",
          type: "select",
          options: candidateKinds.map((v) => ({ value: v, label: v })),
        },
        {
          key: "fee",
          label: "Additional transaction fee",
          type: "money",
          required: false,
        },
      ],
      values: {
        ...c,
        currency: c.currency ?? s.settings.currency,
        occurredAt: c.occurredAt ?? `${today()}T12:00:00+03:00`,
      },
      submit: async (v) => {
        const amended: NotificationCandidate = {
          ...c,
          amount: Number(v.amount),
          currency: v.currency as NotificationCandidate["currency"],
          occurredAt: String(v.occurredAt),
          counterparty: String(v.counterparty),
          direction: v.direction as NotificationCandidate["direction"],
          kind: v.kind as NotificationCandidate["kind"],
          fee: Number(v.fee),
          missing: [],
          validation: "valid",
        };
        if (v.reference) amended.reference = String(v.reference);
        else delete amended.reference;
        await app.mutate("Manually correct notification extraction", (state) =>
          amendNotification(state, record.id, amended),
        );
      },
    });
  }
  function approve(record: InboxRecord) {
    const c = record.amended ?? record.candidate;
    app.dialog({
      title: "Approve notification transaction",
      description:
        "This creates actual ledger entries. Borrowed funds require an existing liability whose principal already includes this borrowing. A fee is an additional expense, not included in the stated amount. Review duplicates and classification carefully.",
      fields: postingFields,
      values: record.posting
        ? { ...record.posting }
        : {
            classification:
              c.direction === "debit" ? "expense" : "other_receipt",
            category: "Uncategorised",
            accountId: mappedAccount(s, c)?.accountId ?? accounts[0]?.value,
          },
      submit: async (v) => {
        await app.mutate("Manually approve notification transaction", (state) =>
          approveNotification(
            state,
            record.id,
            postingValues(v) as Parameters<typeof approveNotification>[2],
          ),
        );
      },
    });
  }
  async function importBatch() {
    if (!batch || busy) return;
    setBusy(true);
    setError("");
    try {
      await app.mutate("Import selected local notification batch", (state) =>
        ingestNotifications(state, batch, trusted),
      );
      if (pendingId) await discardHandoff(pendingId);
      setBatch(undefined);
      setPendingId("");
      setTrusted(false);
      await refreshShares();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const selectedRecord = s.notifications.inbox.find((r) => r.id === selected);
  const visible = s.notifications.inbox.filter((r) => {
    const c = r.amended ?? r.candidate;
    return (
      (!status || r.status === status) &&
      (!source || c.source === source) &&
      (!kind || c.kind === kind) &&
      (!account ||
        (r.posting?.accountId ?? mappedAccount(s, c)?.accountId) === account) &&
      (!from || (c.occurredAt ?? r.importedAt).slice(0, 10) >= from) &&
      (!to || (c.occurredAt ?? r.importedAt).slice(0, 10) <= to) &&
      (!minimum || (c.amount ?? 0) >= Number(minimum) * 100) &&
      (!maximum || (c.amount ?? 0) <= Number(maximum) * 100)
    );
  });
  return (
    <>
      <PageHead
        title="Transaction Inbox"
        subtitle="Local SMS companion imports, explicit financial classification and auditable rules. The PWA does not read SMS or notifications."
      />
      <Card>
        <h2>Receive from your companion</h2>
        <p>
          Shared files are held locally until you inspect and import them.
          Select only your own companion exports. A file's claimed source is not
          proof of authenticity. No historical SMS is accessed.
        </p>
        <label>
          Companion transaction file
          <input
            aria-label="Companion transaction file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError("");
              setTrusted(false);
              setPendingId("");
              void (async () => {
                try {
                  if (file.size > 500000)
                    throw new Error("Handoff exceeds 500 KB");
                  setBatch(parseNotificationBatch(await file.text()));
                } catch (e) {
                  setBatch(undefined);
                  setError(errorMessage(e));
                }
              })();
            }}
          />
        </label>
        {shares.map((share) => (
          <div className="actions" key={share.id}>
            <span>
              Pending local share: {share.batch.candidates.length} candidates /{" "}
              {new Date(share.receivedAt).toLocaleString()}
            </span>
            <Button
              secondary
              onClick={() => {
                setBatch(share.batch);
                setPendingId(share.id);
                setTrusted(false);
              }}
            >
              Review shared batch
            </Button>
            <Button
              secondary
              onClick={() =>
                app.confirm(
                  "Discard local share?",
                  "The companion queue is not deleted. This pending share is not part of the full financial backup until imported.",
                  async () => {
                    await discardHandoff(share.id);
                    await refreshShares();
                  },
                )
              }
            >
              Discard share
            </Button>
          </div>
        ))}
        {batch && (
          <div className="notice">
            <p>
              Batch {batch.batchId}: {batch.candidates.length} candidates.
              Unknown formats remain pending; missing fields are never invented.
            </p>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={trusted}
                onChange={(e) => setTrusted(e.target.checked)}
              />
              This is my trusted companion file; evaluate my enabled approval
              rules
            </label>
            <Button disabled={busy} onClick={() => void importBatch()}>
              Import reviewed batch
            </Button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Card>
      <Card>
        <div className="toolbar">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {[
                "pending",
                "approved",
                "rejected",
                "duplicate",
                "error",
                "conflict",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {[
                ...new Set(
                  s.notifications.inbox.map((r) => r.candidate.source),
                ),
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All types</option>
              {candidateKinds.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Account
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((v) => (
                <option value={v.value} key={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Minimum amount
            <input
              type="number"
              min="0"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
          </label>
          <label>
            Maximum amount
            <input
              type="number"
              min="0"
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
          </label>
        </div>
        <p>
          {visible.length} items. Repeated deliveries are counted on the
          original item; they do not create more ledger entries.
        </p>
        <Table
          headers={[
            "Captured / source",
            "Details",
            "Status / reason",
            "Action",
          ]}
        >
          {visible
            .slice()
            .reverse()
            .slice(0, 200)
            .map((r) => {
              const c = r.amended ?? r.candidate;
              return (
                <tr key={r.id}>
                  <td>
                    {r.importedAt}
                    <small>{c.source}</small>
                  </td>
                  <td>
                    {c.counterparty || c.kind}
                    <small>
                      {c.reference || "Reference missing"} /{" "}
                      {c.amount
                        ? formatMoney(
                            c.amount,
                            c.currency ?? s.settings.currency,
                          )
                        : "Amount missing"}
                    </small>
                  </td>
                  <td>
                    <Badge>{r.status}</Badge>
                    <small>
                      {r.reason} / deliveries {r.deliveries}
                    </small>
                  </td>
                  <td>
                    <Button secondary onClick={() => setSelected(r.id)}>
                      Review item
                    </Button>
                  </td>
                </tr>
              );
            })}
        </Table>
        {visible.length > 200 && (
          <p>
            Showing latest 200 matches. Narrow filters to inspect older records.
          </p>
        )}
      </Card>
      {selectedRecord && (
        <Card>
          <h2>Transaction detail</h2>
          <pre>{JSON.stringify(selectedRecord, null, 2)}</pre>
          <div className="actions">
            <Button secondary onClick={() => editCandidate(selectedRecord)}>
              Correct details
            </Button>
            {selectedRecord.status === "conflict" && (
              <>
                <Button
                  secondary
                  onClick={() =>
                    app.confirm(
                      "Resolve using original capture?",
                      "Other updates remain in the audit/detail view. Review classifications before approving.",
                      async () => {
                        await app.mutate(
                          "Resolve notification conflict using original",
                          (state) =>
                            resolveNotificationConflict(
                              state,
                              selectedRecord.id,
                            ),
                        );
                      },
                    )
                  }
                >
                  Resolve using original
                </Button>
                {selectedRecord.updates?.map((update, index) => (
                  <Button
                    secondary
                    key={index}
                    onClick={() =>
                      app.confirm(
                        "Resolve using this update?",
                        `Update ${index + 1} will supply the review details; no ledger entry is created until approval.`,
                        async () => {
                          await app.mutate(
                            "Resolve notification conflict using reviewed update",
                            (state) =>
                              resolveNotificationConflict(
                                state,
                                selectedRecord.id,
                                index,
                              ),
                          );
                        },
                      )
                    }
                  >
                    Use update {index + 1} ({update.amount ?? "missing amount"})
                  </Button>
                ))}
              </>
            )}
            <Button onClick={() => approve(selectedRecord)}>
              Approve manually
            </Button>
            {(["rejected", "duplicate"] as const).map((next) => (
              <Button
                secondary
                key={next}
                onClick={() =>
                  app.confirm(
                    `Mark ${next}?`,
                    "No ledger entry will be deleted. Posted entries must be corrected using a linked reversal.",
                    async () => {
                      await app.mutate(`Mark notification ${next}`, (state) => {
                        const record = state.notifications.inbox.find(
                          (r) => r.id === selectedRecord.id,
                        )!;
                        if (record.transactionIds.length)
                          throw new Error("Posted records cannot be discarded");
                        record.status = next;
                        record.reason = "Explicit manual decision";
                      });
                    },
                  )
                }
              >
                Mark {next}
              </Button>
            ))}
            <Button
              secondary
              onClick={() =>
                setSimulation(
                  simulateNotification(
                    s,
                    selectedRecord.amended ?? selectedRecord.candidate,
                    true,
                  ).reason,
                )
              }
            >
              Simulate rules (including disabled)
            </Button>
            <Button secondary onClick={() => setSelected("")}>
              Close detail
            </Button>
          </div>
          {simulation && <p role="status">{simulation}</p>}
        </Card>
      )}
      <div className="grid two">
        <Card>
          <h2>Source account mappings</h2>
          <Button
            secondary
            disabled={!accounts.length}
            onClick={() => editMapping()}
          >
            Map source
          </Button>
          {s.notifications.sources.map((m) => (
            <p key={m.id}>
              {m.name}: {m.source} →{" "}
              {s.accounts.find((a) => a.id === m.accountId)?.name} /{" "}
              {m.enabled ? "enabled" : "disabled"} /{" "}
              {m.trusted ? "trusted" : "review only"}{" "}
              <Button secondary onClick={() => editMapping(m.id)}>
                Edit mapping
              </Button>
            </p>
          ))}
        </Card>
        <Card>
          <h2>Deterministic approval rules</h2>
          <Button
            secondary
            disabled={!accounts.length}
            onClick={() => editRule()}
          >
            Create rule
          </Button>
          {s.notifications.rules.map((r) => (
            <p key={r.id}>
              {r.name} v{r.version} / {r.enabled ? "enabled" : "disabled"} /
              matches {r.matchCount} / {r.lastMatchedAt || "never"}{" "}
              <Button secondary onClick={() => editRule(r)}>
                Edit rule
              </Button>
            </p>
          ))}
          <p>
            No default rules treat incoming money as income. Rule changes do not
            rewrite past approvals.
          </p>
        </Card>
      </div>
      <Card>
        <h3>Recovery and transfer confirmation</h3>
        <p>
          Full backups include imported inbox records, rules, mappings,
          identities and ledger provenance, but not the companion's separate
          queue or unimported staged shares. Verify receipt here before marking
          companion items handed off. Retrying retained files is safe.
        </p>
        <Button
          secondary
          onClick={() =>
            download(
              "Pennywise-notification-receipt.json",
              JSON.stringify(
                {
                  format: "pennywise-notification-receipt",
                  version: 1,
                  createdAt: new Date().toISOString(),
                  candidates: s.notifications.inbox.map((r) => ({
                    id: r.candidate.id,
                    fingerprint: r.candidate.fingerprint,
                    status: r.status,
                  })),
                },
                null,
                2,
              ),
            )
          }
        >
          Download local receipt
        </Button>
      </Card>
    </>
  );
}
