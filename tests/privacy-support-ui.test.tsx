import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PrivacySupportPanel } from "../src/privacy-support-ui";
import {
  buildSupportReport,
  collectSupportReport,
} from "../src/support-report";
import { download } from "../src/storage";

const navigate = vi.fn();
vi.mock("../src/context", () => ({ useApp: () => ({ navigate }) }));
vi.mock("../src/support-report", async (original) => ({
  ...(await original<typeof import("../src/support-report")>()),
  collectSupportReport: vi.fn(),
}));
vi.mock("../src/storage", async (original) => ({
  ...(await original<typeof import("../src/storage")>()),
  download: vi.fn(),
}));
const report = buildSupportReport(
  {
    generatedAt: "2026-11-23T12:00:00Z",
    appVersion: "1.3.0",
    applicationAsset: null,
    online: false,
    secureContext: true,
    standalone: false,
    indexedDB: true,
    webCrypto: true,
    webLocks: true,
    serviceWorker: true,
    serviceWorkerControlled: false,
    persistentStorage: "unavailable",
    driveConfigured: false,
    syncConfigured: false,
  },
  undefined,
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(collectSupportReport).mockResolvedValue(report);
});
afterEach(() => vi.restoreAllMocks());

it("creates a preview only on request and downloads only after a separate user choice", async () => {
  render(<PrivacySupportPanel />);
  expect(collectSupportReport).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Download technical report" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare technical report" }),
  );
  await screen.findByText("Technical report preview");
  expect(download).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "unavailable rather than assuming success",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Download technical report" }),
  );
  expect(download).toHaveBeenCalledWith(
    "Pennywise-technical-support.json",
    JSON.stringify(report, null, 2),
  );
  fireEvent.click(screen.getByRole("button", { name: "Open Backup Centre" }));
  expect(navigate).toHaveBeenCalledWith("backup");
});
it("reports preparation/download failures without exposing errors or starting a backup", async () => {
  vi.mocked(collectSupportReport).mockRejectedValueOnce(
    new Error("TEST-private-token"),
  );
  render(<PrivacySupportPanel />);
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare technical report" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be prepared",
  );
  expect(document.body).not.toHaveTextContent("TEST-private-token");
  expect(download).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare technical report" }),
  );
  await screen.findByText("Technical report preview");
  vi.mocked(download).mockImplementationOnce(() => {
    throw new Error("TEST-private-path");
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Download technical report" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "download could not start",
  );
  expect(document.body).not.toHaveTextContent("TEST-private-path");
});
