import { Component, useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  Landmark,
  ClipboardList,
  HandCoins,
  PiggyBank,
  ChartNoAxesCombined,
  Sparkles,
  ChartColumn,
  Settings,
  Plus,
  Menu,
  WifiOff,
  ShieldCheck,
  CircleCheck,
  Download,
  X,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { Context, type DialogSpec } from "./context";
import type { State } from "./domain";
import { openDatabase, Repository } from "./storage";
import { editTransaction, editRecord } from "./forms";
import {
  AccountsPage,
  TransactionsPage,
  BudgetsPage,
  IncomePage,
  BondsPage,
  ObligationsPage,
  ReservesPage,
} from "./pages-records";
import { OverviewPage, ForecastPage, WindfallsPage } from "./pages-planning";
import { ReportsPage, SettingsPage } from "./pages-data";
import {
  RecurringPage,
  OccasionalPage,
  PrepaidPage,
  MonthlyReviewPage,
} from "./pages-expenses";
import { BackupCentre } from "./pages-backup";
import { backupReminder } from "./expense-engine";
import { Button, Card, FormDialog, errorMessage } from "./ui";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "income", label: "Income", icon: TrendingUp },
  { id: "bonds", label: "Bonds", icon: Landmark },
  { id: "obligations", label: "Obligations", icon: ClipboardList },
  { id: "receivables", label: "Receivables", icon: HandCoins },
  { id: "reserves", label: "Reserves", icon: PiggyBank },
  { id: "forecast", label: "Forecast", icon: ChartNoAxesCombined },
  { id: "windfalls", label: "Windfalls", icon: Sparkles },
  { id: "reports", label: "Reports", icon: ChartColumn },
  { id: "recurring", label: "Recurring Expenses", icon: ClipboardList },
  { id: "occasional", label: "Occasional Expenses", icon: Sparkles },
  { id: "prepaid", label: "Prepaid Expenses", icon: Landmark },
  { id: "capture", label: "Savings Capture", icon: PiggyBank },
  { id: "review", label: "Monthly Review", icon: ChartColumn },
  { id: "backup", label: "Backup Centre", icon: Download },
  { id: "settings", label: "Settings", icon: Settings },
];
let updateWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="startup">
        <Card>
          <h1>Unable to display this view</h1>
          <p>
            Your local database has not been reset. Reload the app. Restore a
            backup if a record cannot be loaded.
          </p>
          <Button onClick={() => location.reload()}>Reload safely</Button>
        </Card>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [repo, setRepo] = useState<Repository>();
  const [state, setState] = useState<State>();
  const [error, setError] = useState("");
  const [section, setSection] = useState("overview");
  const [dialog, setDialog] = useState<DialogSpec>();
  const [toast, setToast] = useState("");
  const [preparedDownload, setPreparedDownload] = useState<{
    name: string;
    url: string;
  }>();
  const [drawer, setDrawer] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<
    Event & { prompt: () => Promise<void> }
  >();
  useEffect(() => {
    let active = true;
    let database: IDBDatabase;
    void (async () => {
      try {
        database = await openDatabase();
        const repository = new Repository(database);
        const s = await repository.read();
        if (active) {
          setRepo(repository);
          setState(s);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    })();
    return () => {
      active = false;
      database?.close();
    };
  }, []);
  useEffect(() => {
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let checkingUpdate = false;
    const checkUpdate = async () => {
      if (active && registration?.waiting && navigator.serviceWorker.controller)
        setUpdateReady(true);
      if (
        !active ||
        !registration ||
        registration.installing ||
        checkingUpdate ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      )
        return;
      checkingUpdate = true;
      try {
        await registration.update();
        if (
          active &&
          registration.waiting &&
          navigator.serviceWorker.controller
        )
          setUpdateReady(true);
      } catch {
        // A failed network check must not disrupt the working offline app.
      } finally {
        checkingUpdate = false;
      }
    };
    const online = () => {
      setOffline(!navigator.onLine);
      void checkUpdate();
    };
    const visible = () => void checkUpdate();
    const updateInterval = window.setInterval(visible, 60 * 60 * 1000);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    document.addEventListener("visibilitychange", visible);
    const install = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", install);
    const failed = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      setToast(errorMessage(e.reason));
    };
    window.addEventListener("unhandledrejection", failed);
    const prepared = (event: Event) =>
      setPreparedDownload(
        (event as CustomEvent<{ name: string; url: string }>).detail,
      );
    window.addEventListener("pennywise-prepared-download", prepared);
    updateWorker = registerSW({
      onNeedRefresh: () => active && setUpdateReady(true),
      onOfflineReady: () => active && setOfflineReady(true),
      onRegisteredSW: (_url, current) => {
        registration = current;
        void checkUpdate();
      },
      onRegisterError: () => {
        if (active)
          setToast(
            "Offline cache registration failed. Use HTTPS and reload online.",
          );
      },
    });
    return () => {
      active = false;
      window.clearInterval(updateInterval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("unhandledrejection", failed);
      window.removeEventListener("pennywise-prepared-download", prepared);
    };
  }, []);
  useEffect(() => {
    if (!repo) return;
    const channel = new BroadcastChannel("pennywise-revisions");
    channel.onmessage = () => {
      void repo
        .read()
        .then(setState)
        .catch((e) => setToast(errorMessage(e)));
    };
    return () => channel.close();
  }, [repo]);
  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.settings.theme;
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  if (error)
    return (
      <main className="startup">
        <Card>
          <h1>Local storage unavailable</h1>
          <p role="alert">{error}</p>
          <p>
            No financial records were overwritten. Ensure browser storage is
            enabled, close old tabs and reload.
          </p>
          <Button onClick={() => location.reload()}>Retry</Button>
        </Card>
      </main>
    );
  if (!repo || !state)
    return (
      <main className="startup">
        <div className="logo-mark">P</div>
        <h1>Pennywise</h1>
        <p role="status">Opening your private financial workspace...</p>
      </main>
    );
  const app = {
    state,
    repo,
    mutate: async (action: string, change: (s: State) => void) => {
      try {
        const updated = await repo.update(action, change);
        setState(updated);
        setToast("Saved on this device");
      } catch (e) {
        setToast(errorMessage(e));
        throw e;
      }
    },
    dialog: setDialog,
    confirm: (
      title: string,
      description: string,
      action: () => Promise<void>,
    ) =>
      setDialog({
        title,
        description,
        fields: [],
        values: {},
        submit: action,
        submitLabel: "Confirm",
      }),
    notify: setToast,
    navigate: (id: string) => {
      setSection(id);
      setDrawer(false);
    },
  };
  const content = {
    overview: <OverviewPage />,
    accounts: <AccountsPage />,
    budgets: <BudgetsPage />,
    transactions: <TransactionsPage />,
    income: <IncomePage />,
    bonds: <BondsPage />,
    obligations: <ObligationsPage />,
    receivables: <ObligationsPage receivables />,
    reserves: <ReservesPage />,
    forecast: <ForecastPage />,
    windfalls: <WindfallsPage />,
    reports: <ReportsPage />,
    settings: <SettingsPage />,
    recurring: <RecurringPage />,
    occasional: <OccasionalPage />,
    prepaid: <PrepaidPage />,
    capture: <MonthlyReviewPage captureOnly />,
    review: <MonthlyReviewPage />,
    backup: <BackupCentre />,
  }[section];
  return (
    <Context.Provider value={app}>
      <div className="app-shell">
        {drawer && (
          <button
            className="drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          />
        )}
        <aside className={`sidebar ${drawer ? "open" : ""}`}>
          <a
            className="brand"
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              app.navigate("overview");
            }}
          >
            <span className="logo-mark">P</span>
            <span>
              Pennywise<small>A little wiser. Every day.</small>
            </span>
          </a>
          <span className="nav-label">YOUR WORKSPACE</span>
          <nav aria-label="Main navigation">
            {navigation.map((n) => (
              <button
                key={n.id}
                className={section === n.id ? "active" : ""}
                aria-current={section === n.id ? "page" : undefined}
                onClick={() => app.navigate(n.id)}
              >
                <n.icon size={19} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <ShieldCheck size={21} />
            <strong>Your money. Your device.</strong>
            <small>Private / offline-first / no bank login</small>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div>
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setDrawer(true)}
              >
                <Menu />
              </button>
              <span>Personal finance, thoughtfully organized</span>
            </div>
            <div className="actions">
              <span className={`connection ${offline ? "offline" : ""}`}>
                {offline ? <WifiOff size={15} /> : <CircleCheck size={15} />}
                {offline ? "Offline / local data" : "Local & private"}
              </span>
              {installEvent && (
                <button
                  className="icon-button"
                  aria-label="Install Pennywise"
                  onClick={() => {
                    void installEvent.prompt();
                    setInstallEvent(undefined);
                  }}
                >
                  <Download size={18} />
                </button>
              )}
              <Button
                aria-label="Quick add"
                onClick={() =>
                  state.accounts.length
                    ? editTransaction(app)
                    : editRecord(app, "accounts")
                }
              >
                <Plus size={17} />
                <span className="quick-add-label">Quick add</span>
              </Button>
            </div>
          </header>
          {state.settings.demo && (
            <div className="demo-banner">
              DEMONSTRATION DATA / Fictional balances, rates and dates. Remove
              demo in Settings before recording real data.
            </div>
          )}
          {updateReady && (
            <div className="update-banner">
              <span>
                A new version is ready. Download a full backup and save open
                forms before reloading.
              </span>
              <Button secondary onClick={() => app.navigate("backup")}>
                Backup Centre
              </Button>
              <Button
                secondary
                onClick={() => {
                  void updateWorker?.(true);
                }}
              >
                Reload update
              </Button>
            </div>
          )}
          {offlineReady && (
            <div className="ready-banner" role="status">
              Offline ready. This app can now reopen without a connection.
              <button
                className="icon-button"
                aria-label="Dismiss offline notice"
                onClick={() => setOfflineReady(false)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <main id="main-content">
            {preparedDownload && (
              <Card className="prepared-download no-print">
                <div>
                  <strong>Your portable file is ready.</strong>
                  <p>
                    If the automatic download did not start, use this explicit
                    save link. Verify the file exists before clearing browser
                    data.
                  </p>
                  <small>
                    {preparedDownload.name} / link expires in 5 minutes
                  </small>
                </div>
                <a
                  className="button"
                  href={preparedDownload.url}
                  download={preparedDownload.name}
                >
                  Save prepared file
                </a>
                <button
                  className="icon-button"
                  aria-label="Dismiss prepared file"
                  onClick={() => setPreparedDownload(undefined)}
                >
                  <X size={17} />
                </button>
              </Card>
            )}
            {section !== "backup" && backupReminder(state).length > 0 && (
              <div className="backup-reminder">
                <span>
                  {backupReminder(state)[0]}. Keep a portable copy off this
                  device.
                </span>
                <button
                  className="text-button"
                  onClick={() => app.navigate("backup")}
                >
                  Download full backup
                </button>
              </div>
            )}
            {!state.settings.setup && (
              <Card className="setup">
                <div>
                  <span className="eyebrow">WELCOME TO PENNYWISE</span>
                  <h2>Start with what you know.</h2>
                  <p>
                    Add an account and its opening balance. Then build your
                    income, obligations and budget gradually. Nothing is assumed
                    or mandatory.
                  </p>
                </div>
                <div className="actions">
                  <Button onClick={() => editRecord(app, "accounts")}>
                    Set up first account
                  </Button>
                  <Button
                    secondary
                    onClick={() => {
                      void app.mutate("Complete progressive welcome", (s) => {
                        s.settings.setup = true;
                      });
                      app.navigate("settings");
                    }}
                  >
                    Continue progressively
                  </Button>
                </div>
              </Card>
            )}
            <div key={section}>{content}</div>
            <footer className="page-footer">
              Pennywise 1.1.0 / Figures are based on your records and explicitly
              labeled assumptions. Not personalized investment advice.
            </footer>
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {navigation
            .filter((n) =>
              ["overview", "budgets", "transactions", "forecast"].includes(
                n.id,
              ),
            )
            .map((n) => (
              <button
                key={n.id}
                className={section === n.id ? "active" : ""}
                onClick={() => app.navigate(n.id)}
              >
                <n.icon size={20} />
                <span>{n.label}</span>
              </button>
            ))}
          <button onClick={() => setDrawer(true)}>
            <Menu size={20} />
            <span>More</span>
          </button>
        </nav>
        {dialog && (
          <FormDialog
            key={dialog.title}
            spec={dialog}
            close={() => setDialog(undefined)}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
