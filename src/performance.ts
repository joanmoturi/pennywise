type Phase =
  | "form-validation"
  | "database-read"
  | "mutation"
  | "audit-diff"
  | "financial-validation"
  | "database-commit"
  | "state-update"
  | "save-feedback"
  | "overview-calculation";

export function timing(phase: Phase): () => void {
  const start = performance.now();
  return () => {
    if (!import.meta.env.DEV) return;
    performance.measure(`kichella:${phase}`, {
      start,
      end: performance.now(),
    });
    const entries = performance.getEntriesByName(`kichella:${phase}`);
    if (entries.length > 100) performance.clearMeasures(`kichella:${phase}`);
  };
}
