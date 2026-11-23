import { expect, it } from "vitest";
import { connectionGuidance } from "../src/connection-errors";

it.each([
  ["auth/popup-blocked", "Allow popups"],
  ["popup_failed_to_open", "normal browser"],
  ["auth/popup-closed-by-user", "cancelled"],
  ["auth/unauthorized-domain", "app owner"],
  ["auth/network-request-failed", "Check your connection"],
  ["resource-exhausted", "Stop repeated retries"],
  ["permission-denied", "do not weaken security rules"],
  ["unauthenticated", "same Google account"],
  ["access_denied", "permission was not granted"],
])(
  "gives actionable guidance for %s without provider-supplied personal context",
  (code, expected) => {
    const message = connectionGuidance(
      Object.assign(new Error("TEST-private-provider-context"), { code }),
    );
    expect(message).toContain(expected);
    expect(message).not.toContain("TEST-private");
  },
);
it("leaves unknown errors to existing validation instead of mislabelling them as cancelled sign-in", () => {
  expect(
    connectionGuidance(new Error("Passphrases do not match")),
  ).toBeUndefined();
  expect(
    connectionGuidance({ code: "TEST-unknown", message: "TEST-private" }),
  ).toBeUndefined();
  expect(connectionGuidance(null)).toBeUndefined();
});
