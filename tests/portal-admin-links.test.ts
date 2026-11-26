import { beforeEach, describe, expect, it, vi } from "vitest";

// The admin <-> portal links for a login that is both an admin and a customer.
// Metakocka and the Auth0 lists are faked; only the matching rules are under test.

const partners = new Map<string, { mkId: string; name: string; emails: string[] }>();
const users: { user_id: string; email?: string; name?: string }[] = [];
const rolesByUser = new Map<string, string[]>();

vi.mock("@/lib/metakocka", () => ({
  getPartnerById: async (id: string) => partners.get(id) ?? null,
  resolvePartnerByEmail: async (email: string) =>
    [...partners.values()].find((p) => p.emails.some((e) => e.toLowerCase() === email.toLowerCase())) ?? null,
}));
vi.mock("@/lib/auth0-mgmt", () => ({
  listAllUsers: async () => users,
  getRolesByUserId: async () => ({ rolesByUser, roles: [] }),
}));
vi.mock("@/lib/auth", () => ({ auth0: { getSession: async () => null } }));
vi.mock("@/lib/portal-impersonation", () => ({ readImpersonation: async () => null }));
vi.mock("@/lib/mk-customers", () => ({ getMkCustomer: async () => null, partnerFromDirectory: () => null }));
vi.mock("@/lib/portal-agents", () => ({ getAgentClients: async () => [] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { adminLoginsForPartner, hasOwnPortal, linkSubjectEmail } = await import("@/lib/portal");

beforeEach(() => {
  partners.clear();
  users.length = 0;
  rolesByUser.clear();
});

describe("linkSubjectEmail", () => {
  it("is the session email, the viewed user's email, or none for a customer view", () => {
    expect(linkSubjectEmail("me@x.com", null)).toBe("me@x.com");
    expect(linkSubjectEmail("me@x.com", { kind: "user", email: "nils@x.com" })).toBe("nils@x.com");
    expect(linkSubjectEmail("me@x.com", { kind: "customer" })).toBeNull();
  });
});

describe("hasOwnPortal", () => {
  it("is true only when the email belongs to a customer", async () => {
    partners.set("1", { mkId: "1", name: "Nils", emails: ["contact@nils.example"] });
    expect(await hasOwnPortal("Contact@nils.example")).toBe(true);
    expect(await hasOwnPortal("staff@t4a.example")).toBe(false);
    expect(await hasOwnPortal(null)).toBe(false);
  });
});

describe("adminLoginsForPartner", () => {
  it("returns logins on the partner's emails that hold an admin role", async () => {
    partners.set("1", { mkId: "1", name: "Nils", emails: ["contact@nils.example", "shop@nils.example"] });
    users.push(
      { user_id: "a", email: "Contact@nils.example", name: "Nils Admin" },
      { user_id: "b", email: "shop@nils.example", name: "Shop" },
      { user_id: "c", email: "other@x.example", name: "Other" },
    );
    rolesByUser.set("a", ["builder-admin"]);
    rolesByUser.set("c", ["admin"]);
    expect(await adminLoginsForPartner("1")).toEqual([{ userId: "a", name: "Nils Admin", email: "Contact@nils.example" }]);
  });

  it("is empty for a plain customer or an unknown partner", async () => {
    partners.set("1", { mkId: "1", name: "Plain", emails: ["p@x.example"] });
    users.push({ user_id: "a", email: "p@x.example" });
    expect(await adminLoginsForPartner("1")).toEqual([]);
    expect(await adminLoginsForPartner("missing")).toEqual([]);
  });
});
