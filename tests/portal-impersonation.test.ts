import { describe, expect, it } from "vitest";
import {
  decodeImpersonation,
  effectiveRoles,
  encodeImpersonation,
  sanitizeReturnTo,
  type Impersonation,
} from "@/lib/portal-impersonation-codec";

const SECRET = "test-secret";

function userSubject(roles: string[]): Impersonation {
  return { kind: "user", userId: "auth0|u1", email: "tine@example.com", name: "Tine", roles, returnTo: "/users/auth0%7Cu1", exp: Date.now() + 60_000 };
}

describe("view-as cookie codec", () => {
  it("round-trips a user subject with its roles", async () => {
    const v = userSubject(["preorder-admin", "warranty-admin"]);
    const raw = await encodeImpersonation(v, SECRET);
    expect(await decodeImpersonation(raw, SECRET)).toEqual(v);
  });

  it("round-trips a customer subject", async () => {
    const v: Impersonation = { kind: "customer", partnerMkId: "123", partnerName: "ACME", returnTo: "/preorder/x", exp: Date.now() + 60_000 };
    const raw = await encodeImpersonation(v, SECRET);
    expect(await decodeImpersonation(raw, SECRET)).toEqual(v);
  });

  it("rejects a tampered payload, a wrong secret and an expired subject", async () => {
    const raw = await encodeImpersonation(userSubject(["preorder-admin"]), SECRET);
    const [payload, sig] = raw.split(".");
    // Same signature, edited payload: roles escalated to admin.
    const forged = Buffer.from(JSON.stringify({ ...userSubject(["admin"]) })).toString("base64url");
    expect(await decodeImpersonation(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(await decodeImpersonation(`${payload}.${sig}`, "other")).toBeNull();
    const expired = await encodeImpersonation({ ...userSubject([]), exp: Date.now() - 1 }, SECRET);
    expect(await decodeImpersonation(expired, SECRET)).toBeNull();
    expect(await decodeImpersonation(undefined, SECRET)).toBeNull();
  });

  it("reads a user cookie written before roles existed as role-less", async () => {
    const { roles: _r, ...legacy } = userSubject(["admin"]) as Extract<Impersonation, { kind: "user" }>;
    const raw = await encodeImpersonation(legacy as unknown as Impersonation, SECRET);
    const v = await decodeImpersonation(raw, SECRET);
    expect(v?.kind).toBe("user");
    expect(v?.kind === "user" && v.roles).toEqual([]);
  });

  it("only returns to same-origin admin paths", () => {
    expect(sanitizeReturnTo("/users/x", "/users")).toBe("/users/x");
    expect(sanitizeReturnTo("//evil.example", "/users")).toBe("/users");
    expect(sanitizeReturnTo("https://evil.example", "/users")).toBe("/users");
    expect(sanitizeReturnTo("/portal/invoices", "/users")).toBe("/users");
  });
});

describe("effectiveRoles", () => {
  it("swaps in the viewed user's roles for a super-admin", () => {
    expect(effectiveRoles(["admin"], userSubject(["preorder-admin"]))).toEqual(["preorder-admin"]);
    expect(effectiveRoles(["admin"], userSubject([]))).toEqual([]);
  });

  it("never swaps roles for anyone but a super-admin, nor for a customer subject", () => {
    // A preorder-admin may view as a customer but never as a user — a user cookie
    // (however it got there) must not change their roles.
    expect(effectiveRoles(["preorder-admin"], userSubject(["admin"]))).toEqual(["preorder-admin"]);
    const customer: Impersonation = { kind: "customer", partnerMkId: "1", partnerName: "A", returnTo: "/preorder", exp: Date.now() + 1000 };
    expect(effectiveRoles(["admin"], customer)).toEqual(["admin"]);
    expect(effectiveRoles(["admin"], null)).toEqual(["admin"]);
  });
});
