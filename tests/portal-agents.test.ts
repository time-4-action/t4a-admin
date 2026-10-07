import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { PortalAgent } from "@/models/portal-agent";
import { MkCustomer } from "@/models/mk-customer";
import { agentsOfClients, deleteAgent, getAgent, getAgentClients, listAgents, resolveCustomerLines, saveAgent } from "@/lib/portal-agents";
import { ALL_ACCOUNTS, normalizeAgentClients, portalAccountsFor, resolvePortalScope } from "@/types/portal-agent";

describe("normalizeAgentClients", () => {
  it("trims, dedupes and never lists the agent as their own client", () => {
    const out = normalizeAgentClients("a1", [
      { partnerMkId: " c1 ", partnerName: " Client One " },
      { partnerMkId: "c1", partnerName: "dupe" },
      { partnerMkId: "a1", partnerName: "Self" },
      { partnerMkId: "", partnerName: "blank" },
      { partnerMkId: "c2" },
      "junk",
      null,
    ]);
    expect(out).toEqual([
      { partnerMkId: "c1", partnerName: "Client One" },
      { partnerMkId: "c2", partnerName: "c2" },
    ]);
  });

  it("returns [] for anything that is not a list", () => {
    expect(normalizeAgentClients("a1", { partnerMkId: "c1" })).toEqual([]);
    expect(normalizeAgentClients("a1", undefined)).toEqual([]);
  });
});

describe("portalAccountsFor", () => {
  it("is just the own partner for a plain customer", () => {
    expect(portalAccountsFor({ mkId: "p1", name: "Me" }, [])).toEqual([{ mkId: "p1", name: "Me", own: true }]);
  });

  it("puts the own partner first, then clients A→Z", () => {
    const accounts = portalAccountsFor({ mkId: "a1", name: "Agent" }, [
      { partnerMkId: "c2", partnerName: "Zeta" },
      { partnerMkId: "c1", partnerName: "Alpha" },
      { partnerMkId: "a1", partnerName: "Agent again" },
    ]);
    expect(accounts.map((a) => [a.mkId, a.own])).toEqual([
      ["a1", true],
      ["c1", false],
      ["c2", false],
    ]);
  });
});

describe("resolvePortalScope", () => {
  const agent = portalAccountsFor({ mkId: "a1", name: "Agent" }, [{ partnerMkId: "c1", partnerName: "Client" }]);
  const single = portalAccountsFor({ mkId: "p1", name: "Me" }, []);

  it("a plain customer is always scoped to their own account", () => {
    expect(resolvePortalScope(undefined, single)).toBe("p1");
    expect(resolvePortalScope("all", single)).toBe("p1");
    expect(resolvePortalScope("c1", single)).toBe("p1");
  });

  it("an agent defaults to all accounts", () => {
    expect(resolvePortalScope(undefined, agent)).toBe(ALL_ACCOUNTS);
    expect(resolvePortalScope("", agent)).toBe(ALL_ACCOUNTS);
  });

  it("an agent may narrow to one of their accounts", () => {
    expect(resolvePortalScope("c1", agent)).toBe("c1");
    expect(resolvePortalScope("a1", agent)).toBe("a1");
  });

  it("a foreign or unassigned account id falls back to all — never widens access", () => {
    expect(resolvePortalScope("someone-else", agent)).toBe(ALL_ACCOUNTS);
  });
});

describe("agent storage", () => {
  beforeAll(startMongo);
  afterAll(stopMongo);
  beforeEach(clearMongo);

  it("a customer without an agent record has no clients", async () => {
    expect(await getAgentClients("p1")).toEqual([]);
  });

  it("creates an agent and lists its clients", async () => {
    const saved = await saveAgent({
      partnerMkId: "a1",
      partnerName: "Agent",
      clients: [
        { partnerMkId: "c1", partnerName: "One" },
        { partnerMkId: "a1", partnerName: "Self" },
      ],
      note: " north region ",
      actor: "admin@example.com",
    });
    expect(saved.clients.map((c) => c.partnerMkId)).toEqual(["c1"]);
    expect(saved.note).toBe("north region");
    expect(saved.createdBy).toBe("admin@example.com");
    expect(await getAgentClients("a1")).toEqual([{ partnerMkId: "c1", partnerName: "One" }]);
    expect((await listAgents()).map((a) => a.partnerMkId)).toEqual(["a1"]);
  });

  it("replacing the list keeps a remaining client's original stamp", async () => {
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent", clients: [{ partnerMkId: "c1", partnerName: "One" }], actor: "first@example.com" });
    const before = (await getAgent("a1"))!.clients[0];
    const after = await saveAgent({
      partnerMkId: "a1",
      partnerName: "Agent",
      clients: [
        { partnerMkId: "c1", partnerName: "One" },
        { partnerMkId: "c2", partnerName: "Two" },
      ],
      actor: "second@example.com",
    });
    const c1 = after.clients.find((c) => c.partnerMkId === "c1")!;
    const c2 = after.clients.find((c) => c.partnerMkId === "c2")!;
    expect(c1.addedAt).toBe(before.addedAt);
    expect(c1.addedBy).toBe("first@example.com");
    expect(c2.addedBy).toBe("second@example.com");
    expect(after.createdBy).toBe("first@example.com");
    expect(after.updatedBy).toBe("second@example.com");
  });

  it("a client removed from the list loses the agent's access at once", async () => {
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent", clients: [{ partnerMkId: "c1", partnerName: "One" }], actor: null });
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent", clients: [], actor: null });
    expect(await getAgentClients("a1")).toEqual([]);
  });

  it("deleting an agent makes them a plain customer again", async () => {
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent", clients: [{ partnerMkId: "c1", partnerName: "One" }], actor: null });
    expect(await deleteAgent("a1")).toBe(true);
    expect(await getAgentClients("a1")).toEqual([]);
    expect(await deleteAgent("a1")).toBe(false);
  });

  it("lists the agents a client is shared with", async () => {
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent One", clients: [{ partnerMkId: "c1", partnerName: "One" }], actor: null });
    await saveAgent({ partnerMkId: "a2", partnerName: "Agent Two", clients: [{ partnerMkId: "c1", partnerName: "One" }], actor: null });
    const out = await agentsOfClients(["c1", "c9"]);
    expect(out.c1.map((a) => a.partnerMkId).sort()).toEqual(["a1", "a2"]);
    expect(out.c9).toBeUndefined();
  });

  it("resolves a pasted list by id, customer code, email and exact name — never guessing", async () => {
    const seen = { mkSyncedAt: new Date(), lastSeenInMk: new Date() };
    await MkCustomer.create([
      { ...seen, partnerMkId: "100", name: "Recharge d.o.o.", countCode: "257/2025", emails: ["Info@Recharge.si"], address: {} },
      { ...seen, partnerMkId: "101", name: "Surf Shop", countCode: "300/2025", emails: ["a@surf.example"], address: {} },
      { ...seen, partnerMkId: "102", name: "Surf Shop", countCode: "301/2025", emails: ["b@surf.example"], address: {} },
      { ...seen, partnerMkId: "103", name: "Gone Ltd", countCode: "999/2020", emails: [], address: {}, stale: true },
    ]);
    const res = await resolveCustomerLines(["100", "257/2025", "info@recharge.si", "recharge D.O.O.", "Surf Shop", "999/2020", "nobody", " ", "100"]);
    const by = Object.fromEntries(res.map((r) => [r.line, r]));
    expect(res).toHaveLength(7); // blanks and duplicates dropped
    expect(by["100"]).toMatchObject({ status: "matched", via: "id" });
    expect(by["257/2025"]).toMatchObject({ status: "matched", via: "code" });
    expect(by["info@recharge.si"]).toMatchObject({ status: "matched", via: "email" });
    expect(by["recharge D.O.O."]).toMatchObject({ status: "matched", via: "name" });
    expect(by["Surf Shop"].status).toBe("ambiguous");
    expect(by["999/2020"].status).toBe("unmatched"); // stale directory rows are not offered
    expect(by["nobody"].status).toBe("unmatched");
  });

  it("one agent record per partner", async () => {
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent", clients: [], actor: null });
    await saveAgent({ partnerMkId: "a1", partnerName: "Agent", clients: [], actor: null });
    expect(await PortalAgent.countDocuments({ partnerMkId: "a1" })).toBe(1);
  });
});

describe("submittedBy for an agent's submission", () => {
  it("records the agent, while a customer's own submission records nobody", async () => {
    const { actorSubmittedBy, actorLabel } = await import("@/lib/preorder-mk");
    expect(actorSubmittedBy({ source: "customer" })).toBeNull();
    expect(actorSubmittedBy({ source: "customer", agent: { partnerMkId: "a1", name: "Agent", email: "a@x.com" } })).toBe("Agent <a@x.com> (agent)");
    expect(actorLabel({ source: "customer", agent: { partnerMkId: "a1", name: "Agent", email: null } })).toBe("agent:Agent");
    expect(actorSubmittedBy({ source: "admin", email: "admin@x.com" })).toBe("admin@x.com");
  });
});
