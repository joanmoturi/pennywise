import { createContext, useContext } from "react";
import type { State } from "./domain";
import type { Repository } from "./storage";

export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "money"
    | "rate"
    | "number"
    | "date"
    | "checkbox"
    | "textarea"
    | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  help?: string;
}
export interface DialogSpec {
  title: string;
  description?: string;
  fields: Field[];
  values: Record<string, unknown>;
  submit: (values: Record<string, unknown>) => Promise<void>;
  submitLabel?: string;
}
export interface AppContext {
  state: State;
  repo: Repository;
  mutate: (action: string, change: (s: State) => void) => Promise<void>;
  dialog: (spec: DialogSpec) => void;
  confirm: (
    title: string,
    description: string,
    action: () => Promise<void>,
  ) => void;
  notify: (message: string) => void;
  navigate: (section: string) => void;
}
export const Context = createContext<AppContext | null>(null);
export function useApp(): AppContext {
  const app = useContext(Context);
  if (!app) throw new Error("Application context missing");
  return app;
}
