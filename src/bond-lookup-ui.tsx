import { useState } from "react";
import {
  lookupBond,
  bondFormPopulation,
  referenceChanges,
  type BondSearchResult,
} from "./bond-lookup";
import { type BondReference } from "./bond-reference-schema";
import type { AppContext } from "./context";
import { uid, today, type Bond } from "./domain";
import { coupon } from "./engine";
import { editRecord } from "./forms";
import { errorMessage } from "./ui";

export function editBond(app: AppContext, record?: Bond) {
  editRecord(app, "bonds", record, (values, populate) => (
    <BondLookupPanel
      initialQuery={String(values.identifier ?? "")}
      previous={record?.reference}
      currency={app.state.settings.currency}
      populate={populate}
    />
  ));
}
export function addPublishedCouponDates(app: AppContext, bond: Bond) {
  const dates =
    bond.reference?.couponDates.filter(
      (date) =>
        date >= today() &&
        date <= bond.maturity &&
        !app.state.events.some(
          (event) =>
            event.sourceId === bond.id &&
            event.due === date &&
            event.status !== "cancelled",
        ),
    ) ?? [];
  app.confirm(
    "Add published dates as expected coupons?",
    `${dates.length} future published dates: ${dates.join(", ") || "None"}. Amounts use your personal principal, precise coupon rate, tax and explicitly selected amortisation estimate. Review CSD-dependent redemption rules. Existing events and receipts remain unchanged; no cash or principal is recorded.`,
    async () =>
      app.mutate(
        "Add explicitly confirmed published coupon schedule",
        (state) => {
          const current = state.bonds.find(
            (candidate) => candidate.id === bond.id,
          );
          if (!current || JSON.stringify(current) !== JSON.stringify(bond))
            throw new Error("Bond changed. Review the current holding first.");
          for (const due of dates) {
            if (
              state.events.some(
                (event) =>
                  event.sourceId === bond.id &&
                  event.due === due &&
                  event.status !== "cancelled",
              )
            )
              continue;
            const amount = coupon(bond, due).net;
            if (amount === 0) continue;
            state.events.push({
              id: uid(),
              sourceId: bond.id,
              kind: "bond",
              due,
              amount,
              status: "expected",
              reliability: "uncertain",
              notes: `Published CBK date; estimated personal net amount, not a received payment. Source reviewed ${bond.reference?.verifiedAt}.`,
            });
          }
        },
      ),
  );
}
export function BondLookupPanel({
  initialQuery,
  previous,
  currency,
  populate,
}: {
  initialQuery: string;
  previous?: BondReference;
  currency: string;
  populate: (values: Record<string, unknown>) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<BondSearchResult>();
  const [selected, setSelected] = useState<BondReference>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [manual, setManual] = useState(false);
  async function find(refresh = false) {
    setBusy(true);
    setError("");
    setSelected(undefined);
    setConfirmed(false);
    setManual(false);
    setResult(undefined);
    try {
      setResult(await lookupBond(query, refresh));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const changes = selected ? referenceChanges(previous, selected) : [];
  return (
    <section aria-label="Official bond lookup" className="notice">
      <h3>Official Kenyan bond details</h3>
      <label>
        Issue number, ISIN or recognised bond name
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(undefined);
            setConfirmed(false);
          }}
          maxLength={160}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void find()}
        >
          Find Bond Details
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void find(true)}
        >
          Refresh Bond Details
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setManual(true);
            setSelected(undefined);
            setResult(undefined);
            setError("");
          }}
        >
          Enter details manually
        </button>
      </div>
      {busy && (
        <p role="status">
          Checking available official records… Manual fields remain available.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result?.warning && <p role="status">{result.warning}</p>}
      {result && !result.matches.length && !manual && (
        <div>
          <h4>Bond not found</h4>
          <p>
            We couldn&apos;t verify this bond using the available official
            records. Please check the bond name, issue number or ISIN, or enter
            the details manually.
          </p>
          <button type="button" onClick={() => void find(true)}>
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(undefined);
              setQuery("");
            }}
          >
            Edit search
          </button>
        </div>
      )}
      {result &&
        !manual &&
        [...result.matches, ...result.suggestions].map((record) => (
          <button
            type="button"
            className="button secondary"
            key={record.isin}
            onClick={() => {
              setSelected(record);
              setConfirmed(false);
            }}
          >
            {result.suggestions.length
              ? "Suggestion — select to review: "
              : "Review: "}
            {record.issueNumber} · {record.isin} ·{" "}
            {record.maturity ?? "Maturity unavailable"}
          </button>
        ))}
      {selected && !manual && (
        <div>
          <h4>Review official reference information</h4>
          <dl>
            <dt>Bond</dt>
            <dd>{selected.name}</dd>
            <dt>Issue / ISIN</dt>
            <dd>
              {selected.issueNumber} / {selected.isin}
            </dd>
            <dt>Issuer / type / currency</dt>
            <dd>
              {selected.issuer} / {selected.instrumentType} /{" "}
              {selected.currency}
            </dd>
            <dt>Original tenor</dt>
            <dd>{selected.tenor ?? "Unavailable"}</dd>
            <dt>Coupon rate / type</dt>
            <dd>
              {selected.couponPercent !== undefined
                ? `${selected.couponPercent}%`
                : "Unavailable"}{" "}
              / {selected.couponType ?? "Unavailable"}
            </dd>
            <dt>Maturity / final redemption date</dt>
            <dd>{selected.maturity ?? "Unavailable"}</dd>
            <dt>Payments per year</dt>
            <dd>{selected.paymentsPerYear ?? "Unavailable"}</dd>
            <dt>Tax</dt>
            <dd>
              {selected.taxPercent !== undefined
                ? `${selected.taxPercent}%`
                : "Unavailable; confirm manually"}
            </dd>
            <dt>Original issue date / publication date</dt>
            <dd>
              {selected.issueDate ?? "Unavailable"} /{" "}
              {selected.publicationDate ?? "Unavailable"}
            </dd>
            <dt>Schedule coverage</dt>
            <dd>
              {selected.scheduleStatus}; published dates below are not received
              payments.
            </dd>
            <dt>Amortisation</dt>
            <dd>
              {selected.amortisation.length
                ? selected.amortisation
                    .map(
                      (a) =>
                        `${a.date}: ${a.percentOfOutstanding}% of outstanding`,
                    )
                    .join("; ")
                : "Unavailable"}
            </dd>
            <dt>Final redemption</dt>
            <dd>
              {selected.finalRedemptionPercentOfOutstanding !== undefined
                ? `${selected.finalRedemptionPercentOfOutstanding}% of remaining outstanding`
                : "Unavailable"}
            </dd>
            <dt>Last verified / retrieved</dt>
            <dd>
              {selected.verifiedAt} / {selected.retrievedAt}
            </dd>
            <dt>Verification</dt>
            <dd>{selected.verification}</dd>
          </dl>
          <p>{selected.redemptionConditions}</p>
          <p>
            <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
              Official CBK source
            </a>{" "}
            {selected.prospectusUrl ? (
              <a href={selected.prospectusUrl} target="_blank" rel="noreferrer">
                Inspect official prospectus
              </a>
            ) : (
              "Prospectus not verified; schedule and repayment terms require manual entry."
            )}
          </p>
          <details>
            <summary>
              Published coupon dates ({selected.couponDates.length})
            </summary>
            <p>
              {selected.couponDates.join(", ") ||
                "Unavailable; configure manually. No generic schedule has been invented."}
            </p>
          </details>
          {changes.length > 0 && (
            <details open>
              <summary>Differences from saved reference (not applied)</summary>
              {changes.map((change) => (
                <p key={change}>{change}</p>
              ))}
            </details>
          )}
          <p>
            Manual holding fields are never supplied by CBK: principal held,
            maturity proceeds, receiving account, purchase price, acquisition
            date and custody details. Record purchase/custody details in your
            notes. Missing official fields are not populated. Existing schedules
            and actual receipts will not change.
          </p>
          {currency !== selected.currency && (
            <p role="alert">
              This workspace uses {currency}. Kenyan KES terms cannot be applied
              to a different currency workspace.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I reviewed the source and differences and confirm replacing only the
            available official term fields in this draft.
          </label>
          <button
            type="button"
            className="button"
            disabled={!confirmed || currency !== selected.currency || busy}
            onClick={() => {
              try {
                populate(
                  bondFormPopulation(selected) as Record<string, unknown>,
                );
                setSelected(undefined);
                setResult(undefined);
                setConfirmed(false);
              } catch (error) {
                setError(errorMessage(error));
              }
            }}
          >
            Use These Details
          </button>
        </div>
      )}
      {manual && (
        <p>
          Continue with the manual fields below. Nothing was saved or changed by
          lookup.
        </p>
      )}
    </section>
  );
}
