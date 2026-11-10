import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, Plus, Pencil, Trash2 } from "lucide-react";
import type { DialogSpec } from "./context";
import { parseMoney, decimal } from "./money";
import { ZodError } from "zod";
import { timing } from "./performance";

export function errorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .slice(0, 4)
      .join("; ");
  return error instanceof Error
    ? error.message
    : "The operation failed; please retry";
}
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      className={secondary ? "button secondary" : "button"}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick}>
      <Plus size={17} />
      {children}
    </Button>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card className="empty">
      <div className="empty-symbol">+</div>
      <h3>{title}</h3>
      <p>
        {children ||
          "Add your own records. No balances or payment dates are assumed."}
      </p>
    </Card>
  );
}
export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">YOUR FINANCIAL COMMAND CENTRE</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={`metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </Card>
  );
}
export function Badge({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <span className={`badge ${warning ? "warning" : ""}`}>{children}</span>
  );
}
export function Progress({ value, total }: { value: number; total: number }) {
  const percentage =
    total > 0
      ? Math.max(
          0,
          Math.min(100, Number((BigInt(value) * 10000n) / BigInt(total)) / 100),
        )
      : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Budget used"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}
export function Actions({
  edit,
  remove,
  label,
}: {
  edit: () => void;
  remove: () => void;
  label: string;
}) {
  return (
    <div className="actions">
      <button
        className="icon-button"
        aria-label={`Edit ${label}`}
        onClick={edit}
      >
        <Pencil size={16} />
      </button>
      <button
        className="icon-button danger"
        aria-label={`Delete ${label}`}
        onClick={remove}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Children.map(children, (row) => {
            if (!isValidElement(row)) return row;
            const element = row as ReactElement<{ children: ReactNode }>;
            return cloneElement(
              element,
              {},
              Children.map(element.props.children, (cell, index) => {
                if (!isValidElement(cell)) return cell;
                const td = cell as ReactElement<{ children: ReactNode }>;
                return cloneElement(
                  td,
                  {},
                  <>
                    <span className="cell-label" aria-hidden="true">
                      {headers[index]}
                    </span>
                    {td.props.children}
                  </>,
                );
              }),
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function BarChart({
  title,
  data,
  format,
}: {
  title: string;
  data: { name: string; amount: number; secondary?: number }[];
  format: (n: number) => string;
}) {
  const max = Math.max(
    1,
    ...data.flatMap((d) => [Math.abs(d.amount), Math.abs(d.secondary || 0)]),
  );
  return (
    <Card>
      <h3>{title}</h3>
      {!data.length ? (
        <p>No actual records for this period.</p>
      ) : (
        <div className="bar-chart">
          {data.map((d) => (
            <div key={d.name} className="bar-row">
              <div>
                <span>{d.name}</span>
                <strong>{format(d.amount)}</strong>
              </div>
              <div className="bar-track">
                <span
                  style={{ width: `${(Math.abs(d.amount) / max) * 100}%` }}
                />
              </div>
              {d.secondary !== undefined && (
                <>
                  <div className="bar-track comparison">
                    <span
                      style={{
                        width: `${(Math.abs(d.secondary) / max) * 100}%`,
                      }}
                    />
                  </div>
                  <small>Comparison: {format(d.secondary)}</small>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
export function LineChart({
  title,
  lines,
}: {
  title: string;
  lines: { name: string; values: number[]; color: string }[];
}) {
  const values = lines.flatMap((l) => l.values);
  if (!values.length)
    return (
      <Card>
        <h3>{title}</h3>
        <p>No data yet.</p>
      </Card>
    );
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min || 1;
  return (
    <Card>
      <h3>{title}</h3>
      <svg
        className="line-chart"
        viewBox="0 0 600 180"
        role="img"
        aria-label={title}
      >
        <line
          x1="10"
          y1={170 - ((0 - min) / span) * 150}
          x2="590"
          y2={170 - ((0 - min) / span) * 150}
          stroke="currentColor"
          opacity=".2"
        />
        {lines.map((l) => (
          <polyline
            key={l.name}
            points={l.values
              .map(
                (v, i) =>
                  `${10 + (i * 580) / Math.max(1, l.values.length - 1)},${170 - ((v - min) / span) * 150}`,
              )
              .join(" ")}
            fill="none"
            stroke={l.color}
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="legend">
        {lines.map((l) => (
          <span key={l.name}>
            <i style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
      </div>
      <small>
        Relative scale. Exact balances appear in the accompanying tables.
      </small>
    </Card>
  );
}
export function FormDialog({
  spec,
  close,
}: {
  spec: DialogSpec;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [inputs, setInputs] = useState(spec.values);
  const [draftValues, setDraftValues] = useState(spec.values);
  const [populationVersion, setPopulationVersion] = useState(0);
  const [advanced, setAdvanced] = useState(
    spec.fields.some(
      (f) =>
        f.advanced &&
        [
          "restricted",
          "notes",
          "destinationId",
          "relatedId",
          "subcategory",
          "minimum",
          "maximum",
          "end",
        ].includes(f.key) &&
        Boolean(spec.values[f.key]),
    ) || ["custom", "irregular"].includes(String(spec.values.frequency)),
  );
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const data = new FormData(e.currentTarget);
    setError("");
    setFieldErrors({});
    setBusy(true);
    setSlow(false);
    const endFeedback = timing("save-feedback");
    let activeField = "";
    try {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function")
          requestAnimationFrame(() => setTimeout(resolve, 0));
        else setTimeout(resolve, 0);
      });
      const endValidation = timing("form-validation");
      const values = { ...draftValues };
      for (const f of spec.fields) {
        activeField = f.key;
        const raw = String(data.get(f.key) ?? "");
        values[f.key] =
          f.required === false &&
          raw === "" &&
          ["money", "rate", "number"].includes(f.type ?? "")
            ? undefined
            : f.type === "checkbox"
              ? data.has(f.key)
              : f.type === "money" || f.type === "rate"
                ? parseMoney(raw || "0")
                : f.type === "number"
                  ? Number(raw)
                  : raw;
      }
      activeField = "";
      endValidation();
      await spec.submit(values);
      endFeedback();
      close();
    } catch (error) {
      const errors: Record<string, string> = {};
      if (activeField) errors[activeField] = errorMessage(error);
      if (error instanceof ZodError)
        for (const issue of error.issues) {
          const key = String(issue.path.at(-1));
          if (spec.fields.some((f) => f.key === key))
            errors[key] = issue.message;
        }
      setFieldErrors(errors);
      if (Object.keys(errors).length) setAdvanced(true);
      setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
      setSlow(false);
    }
  }
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      aria-labelledby="dialog-title"
      aria-describedby={spec.description ? "dialog-description" : undefined}
      aria-busy={busy}
    >
      <form
        onSubmit={submit}
        onChange={(event) => {
          if (spec.context || spec.draftPanel)
            setInputs(
              Object.fromEntries(new FormData(event.currentTarget).entries()),
            );
          const target = event.target;
          if (!(
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement
          ))
            return;
          if (
            target.name === "type" &&
            !["income", "expense"].includes(target.value)
          )
            setAdvanced(true);
          if (
            target.name === "frequency" &&
            ["custom", "irregular"].includes(target.value)
          )
            setAdvanced(true);
        }}
      >
        <div className="dialog-head">
          <h2 id="dialog-title">{spec.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
            disabled={busy}
          >
            <X />
          </button>
        </div>
        {spec.description && (
          <p className="dialog-description" id="dialog-description">
            {spec.description}
          </p>
        )}
        {spec.context && (
          <p className="notice" aria-live="polite" aria-atomic="true">
            {spec.context(inputs)}
          </p>
        )}
        {spec.draftPanel && (
          <fieldset disabled={busy}>
            <legend className="visually-hidden">
              Optional official reference lookup
            </legend>
            {spec.draftPanel(inputs, (values) => {
              const form = ref.current?.querySelector("form");
              const current = form
                ? Object.fromEntries(new FormData(form).entries())
                : {};
              const next = { ...draftValues };
              for (const field of spec.fields) {
                const raw = String(current[field.key] ?? "");
                next[field.key] =
                  field.required === false &&
                  raw === "" &&
                  ["money", "rate", "number"].includes(field.type ?? "")
                    ? undefined
                    : field.type === "checkbox"
                      ? Boolean(current[field.key])
                      : field.type === "money" || field.type === "rate"
                        ? parseMoney(raw || "0")
                        : field.type === "number"
                          ? Number(raw)
                          : raw;
              }
              Object.assign(next, values);
              setDraftValues(next);
              setInputs(next);
              setPopulationVersion((n) => n + 1);
            })}
          </fieldset>
        )}
        {error && (
          <div className="error" role="alert" tabIndex={-1} ref={errorRef}>
            <strong>Could not save. Your entries are still here.</strong>
            <p>{error}</p>
            {Object.entries(fieldErrors).map(([key, message]) => (
              <a
                key={key}
                href={`#field-${key}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(`field-${key}`)?.focus();
                }}
              >
                {spec.fields.find((f) => f.key === key)?.label}: {message}
              </a>
            ))}
          </div>
        )}
        {spec.fields.some((f) => f.advanced) && (
          <button
            type="button"
            className="text-button"
            aria-expanded={advanced}
            aria-controls="dialog-fields"
            disabled={busy}
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced
              ? "Hide optional details"
              : "Optional details and linked records"}
          </button>
        )}
        <fieldset disabled={busy} id="dialog-fields">
          <legend className="visually-hidden">Record details</legend>
          <div className="form-grid" key={populationVersion}>
            {spec.fields.map((f) => {
              const value = draftValues[f.key];
              const display =
                (f.type === "money" || f.type === "rate") &&
                typeof value === "number"
                  ? decimal(value)
                  : String(value ?? "");
              return (
                <label
                  key={f.key}
                  className={f.type === "textarea" ? "full" : ""}
                  hidden={f.advanced && !advanced}
                >
                  <span id={`label-${f.key}`}>{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      id={`field-${f.key}`}
                      aria-labelledby={`label-${f.key}`}
                      name={f.key}
                      aria-invalid={Boolean(fieldErrors[f.key])}
                      aria-describedby={
                        [
                          f.help && `help-${f.key}`,
                          fieldErrors[f.key] && `error-${f.key}`,
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      defaultValue={display}
                      required={f.required !== false}
                    >
                      {f.required === false && <option value="">None</option>}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      id={`field-${f.key}`}
                      aria-labelledby={`label-${f.key}`}
                      name={f.key}
                      aria-invalid={Boolean(fieldErrors[f.key])}
                      aria-describedby={
                        fieldErrors[f.key]
                          ? `error-${f.key}`
                          : f.help
                            ? `help-${f.key}`
                            : undefined
                      }
                      defaultValue={display}
                      rows={3}
                      maxLength={2000}
                    />
                  ) : f.type === "checkbox" ? (
                    <input
                      id={`field-${f.key}`}
                      aria-labelledby={`label-${f.key}`}
                      type="checkbox"
                      name={f.key}
                      defaultChecked={Boolean(value)}
                    />
                  ) : (
                    <input
                      id={`field-${f.key}`}
                      aria-labelledby={`label-${f.key}`}
                      name={f.key}
                      aria-invalid={Boolean(fieldErrors[f.key])}
                      aria-describedby={
                        [
                          f.help && `help-${f.key}`,
                          fieldErrors[f.key] && `error-${f.key}`,
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      type={
                        f.type === "date"
                          ? "date"
                          : f.type === "number"
                            ? "number"
                            : "text"
                      }
                      inputMode={
                        f.type === "money" || f.type === "rate"
                          ? "decimal"
                          : undefined
                      }
                      step={f.type === "number" ? "any" : undefined}
                      defaultValue={display}
                      required={f.required !== false}
                      maxLength={f.type === "text" || !f.type ? 160 : undefined}
                    />
                  )}
                  {f.help && <small id={`help-${f.key}`}>{f.help}</small>}
                  {fieldErrors[f.key] && (
                    <small className="field-error" id={`error-${f.key}`}>
                      {fieldErrors[f.key]}
                    </small>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
        {busy && (
          <p role="status">
            {slow
              ? "Still waiting for local storage. Keep this form open; it will confirm the save or let you retry safely."
              : "Saving on this device..."}
          </p>
        )}
        <div className="dialog-footer">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving..." : spec.submitLabel || "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
