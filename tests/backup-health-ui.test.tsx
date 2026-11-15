import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BackupHealthCard } from "../src/backup-health-ui";
import { backupQueue, cloudBackup, cloudConfig } from "../src/cloud-backup";
import { fixture } from "./fixtures";

const app = { state: fixture(), navigate: vi.fn() };
vi.mock("../src/context", () => ({ useApp: () => app }));
vi.mock("../src/google-services", async (original) => ({
  ...(await original<typeof import("../src/google-services")>()),
  GOOGLE_CLIENT_ID: "synthetic-client.apps.googleusercontent.com",
}));
vi.mock("../src/cloud-backup", async (original) => ({
  ...(await original<typeof import("../src/cloud-backup")>()),
  cloudConfig: vi.fn(),
  backupQueue: vi.fn(),
}));
beforeEach(() => {
  app.state = fixture();
  app.navigate.mockClear();
  vi.mocked(cloudConfig).mockResolvedValue({
    deviceId: "synthetic",
    enabled: true,
    owner: "synthetic-owner",
    retention: 10,
  });
  vi.mocked(backupQueue).mockResolvedValue({
    status: "verified",
    verifiedRevision: 0,
    latestRevision: 0,
    attempts: 0,
    retryAt: 0,
    lastAttempt: "2026-11-15T10:00:00Z",
    lastSuccess: "2026-11-15T10:00:00Z",
    lastFile: "synthetic-file",
    lastSize: 4000,
    message: "",
  });
  vi.spyOn(cloudBackup.session, "driveIdentity", "get").mockReturnValue({
    sub: "synthetic-owner",
    email: "synthetic@example.test",
  });
  vi.spyOn(cloudBackup, "unlocked", "get").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
describe("backup health presentation", () => {
  it("invalidates a healthy badge as soon as the local revision changes and opens the existing backup workflow", async () => {
    const view = render(<BackupHealthCard />);
    await screen.findByText("Backed up", { exact: true });
    app.state = { ...app.state, revision: 1 };
    view.rerender(<BackupHealthCard />);
    expect(screen.getByText("Changes pending", { exact: true })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Review pending backup" }),
    );
    expect(app.navigate).toHaveBeenCalledWith("backup");
  });
  it("keeps storage failures recoverable without a false success and retries locally on focus", async () => {
    vi.mocked(cloudConfig).mockRejectedValueOnce(
      new Error("synthetic storage failure"),
    );
    render(<BackupHealthCard />);
    await screen.findByText("Action needed", { exact: true });
    expect(screen.getByText(/Backup status could not be read/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create a manual backup" }),
    ).toBeEnabled();
    fireEvent.focus(window);
    await waitFor(() =>
      expect(screen.getByText("Backed up", { exact: true })).toBeVisible(),
    );
  });
});
