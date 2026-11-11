import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CloudBackupPanel } from "../src/cloud-backup-ui";
import { cloudBackup, cloudConfig } from "../src/cloud-backup";
import { GoogleDriveRepository } from "../src/google-services";
import { auxiliaryUpdate } from "../src/auxiliary-storage";
import { openDatabase, Repository } from "../src/storage";
import type { useApp } from "../src/context";
import { fixture } from "./fixtures";

vi.mock("../src/context", () => ({ useApp: () => app }));
vi.mock("../src/google-services", async (original) => ({
  ...(await original<typeof import("../src/google-services")>()),
  GOOGLE_CLIENT_ID: "synthetic-client.apps.googleusercontent.com",
}));

let app: Pick<ReturnType<typeof useApp>, "repo" | "state" | "notify">;
let db: IDBDatabase;
let selected: { sub: string; email: string } | undefined;
let unlocked = false;
const account = { sub: "synthetic-owner", email: "synthetic@example.test" };
const passphrase = "synthetic backup passphrase";

beforeEach(async () => {
  db = await openDatabase(`TEST-cloud-ui-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  await repo.restore(fixture());
  app = { repo, state: await repo.read(), notify: vi.fn() };
  await auxiliaryUpdate("cloud-config", () => ({
    deviceId: crypto.randomUUID(),
    owner: "",
    enabled: false,
    retention: 10,
  }));
  await auxiliaryUpdate("cloud-queue", () => undefined);
  selected = undefined;
  unlocked = false;
  vi.spyOn(cloudBackup.session, "resume").mockResolvedValue();
  vi.spyOn(cloudBackup.session, "renderSignIn").mockResolvedValue();
  vi.spyOn(cloudBackup.session, "driveIdentity", "get").mockImplementation(
    () => selected,
  );
  vi.spyOn(cloudBackup.session, "connectDrive").mockImplementation(async () => {
    selected = account;
  });
  vi.spyOn(cloudBackup, "unlocked", "get").mockImplementation(() => unlocked);
  vi.spyOn(cloudBackup, "unlock").mockImplementation(async () => {
    unlocked = true;
  });
  vi.spyOn(cloudBackup, "run").mockImplementation(async () => {
    await auxiliaryUpdate("cloud-queue", () => ({
      status: "verified",
      lastSuccess: new Date().toISOString(),
    }));
  });
  vi.spyOn(GoogleDriveRepository.prototype, "list").mockResolvedValue([]);
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});
async function enable() {
  const button = await screen.findByRole("button", {
    name: "Enable Google Drive Backup",
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(async () => expect((await cloudConfig()).enabled).toBe(true));
  await screen.findByText(/Google Drive backup is enabled on this device/);
}
async function unlock() {
  fireEvent.change(screen.getByLabelText(/Drive encryption passphrase/), {
    target: { value: passphrase },
  });
  fireEvent.change(screen.getByLabelText("Confirm passphrase"), {
    target: { value: passphrase },
  });
  const button = screen.getByRole("button", {
    name: "Unlock and Back Up",
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("customer Google Drive backup flow", () => {
  it("does not initialize optional Google sign-in until the customer opens it", async () => {
    render(<CloudBackupPanel />);
    await screen.findByText("Google Drive backup is off.");
    expect(cloudBackup.session.renderSignIn).not.toHaveBeenCalled();
    const details = screen
      .getByText("Optional Google sign-in")
      .closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() =>
      expect(cloudBackup.session.renderSignIn).toHaveBeenCalledTimes(1),
    );
  });

  it("chooses one Google account, saves enabled across remount and allows disabling while disconnected", async () => {
    const before = await app.repo.read();
    const view = render(<CloudBackupPanel />);
    await enable();
    expect(cloudBackup.session.connectDrive).toHaveBeenCalledTimes(1);
    expect(cloudBackup.session.identity).toBeUndefined();
    expect((await cloudConfig()).owner).toBe(account.sub);
    expect(cloudBackup.run).not.toHaveBeenCalled();
    view.unmount();
    selected = undefined;
    render(<CloudBackupPanel />);
    await screen.findByRole("button", { name: "Reconnect Google Drive" });
    const automatic = screen.getByRole("checkbox", {
      name: "Automatic backups while the application is active",
    });
    expect(automatic).toBeChecked();
    expect(automatic).toBeEnabled();
    fireEvent.click(automatic);
    await waitFor(async () =>
      expect((await cloudConfig()).enabled).toBe(false),
    );
    expect((await cloudConfig()).owner).toBe(account.sub);
    expect(await app.repo.read()).toEqual(before);
  });

  it("does not enable backup or change records when the account chooser is cancelled", async () => {
    vi.mocked(cloudBackup.session.connectDrive).mockRejectedValue(
      new Error("Google Drive connection cancelled"),
    );
    const before = await app.repo.read();
    render(<CloudBackupPanel />);
    const button = screen.getByRole("button", {
      name: "Enable Google Drive Backup",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google Drive connection cancelled",
    );
    expect(await cloudConfig()).toMatchObject({ enabled: false, owner: "" });
    expect(cloudBackup.run).not.toHaveBeenCalled();
    expect(await app.repo.read()).toEqual(before);
  });

  it("preserves the original backup account when another Google account is chosen", async () => {
    await auxiliaryUpdate("cloud-config", (value) => ({
      ...(value as object),
      owner: "original-owner",
      enabled: true,
    }));
    render(<CloudBackupPanel />);
    const button = await screen.findByRole("button", {
      name: "Reconnect Google Drive",
    });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "bound to another Google Drive account",
    );
    expect(await cloudConfig()).toMatchObject({
      owner: "original-owner",
      enabled: true,
    });
    expect(cloudBackup.run).not.toHaveBeenCalled();
  });

  it("starts the first backup after unlocking and reports success only after verification", async () => {
    render(<CloudBackupPanel />);
    await enable();
    await unlock();
    await waitFor(() =>
      expect(app.notify).toHaveBeenCalledWith(
        "Google Drive backup uploaded and verified.",
      ),
    );
    expect(cloudBackup.unlock).toHaveBeenCalledWith(
      passphrase,
      passphrase,
      app.repo,
      "",
    );
    expect(cloudBackup.run).toHaveBeenCalledWith(app.repo, true, true);
    expect(screen.getByLabelText(/Drive encryption passphrase/)).toHaveValue(
      "",
    );
    expect((await cloudConfig()).enabled).toBe(true);
  });

  it("keeps backup enabled after a failed first upload without claiming success", async () => {
    vi.mocked(cloudBackup.run).mockImplementation(async () => {
      await auxiliaryUpdate("cloud-queue", () => ({
        status: "retry scheduled",
        message: "Waiting for internet. Local changes are safe.",
      }));
    });
    render(<CloudBackupPanel />);
    await enable();
    await unlock();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Waiting for internet",
    );
    expect(app.notify).not.toHaveBeenCalled();
    expect((await cloudConfig()).enabled).toBe(true);
  });
});
