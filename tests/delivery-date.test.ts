import { describe, expect, it } from "vitest";
import { deliveryDateIso, mkDeliveryDeadline, parseDeliveryDate } from "@/lib/delivery-date";

describe("delivery date", () => {
  it("parses ISO and pasted European formats", () => {
    expect(parseDeliveryDate("2026-11-15")).toBe("2026-11-15");
    expect(parseDeliveryDate("2026-11-15T00:00:00.000Z")).toBe("2026-11-15");
    expect(parseDeliveryDate(" 15.11.2026 ")).toBe("2026-11-15");
    expect(parseDeliveryDate("15. 11. 2026")).toBe("2026-11-15");
    expect(parseDeliveryDate("5/1/2027")).toBe("2027-01-05");
    expect(parseDeliveryDate("15-11-2026")).toBe("2026-11-15");
    expect(parseDeliveryDate(new Date("2026-11-15T00:00:00.000Z"))).toBe("2026-11-15");
  });

  it("rejects junk a paste can leave in a date field", () => {
    expect(parseDeliveryDate("151120-11-15")).toBeNull();
    expect(parseDeliveryDate("+151120-11-15T00:00:00.000Z")).toBeNull();
    expect(parseDeliveryDate("0002-11-15")).toBeNull();
    expect(parseDeliveryDate("31.02.2026")).toBeNull();
    expect(parseDeliveryDate("next week")).toBeNull();
    expect(parseDeliveryDate(new Date("x"))).toBeNull();
    expect(parseDeliveryDate(null)).toBeNull();
  });

  it("formats for storage and for Metakocka", () => {
    expect(deliveryDateIso("15.11.2026")).toBe("2026-11-15T00:00:00.000Z");
    expect(deliveryDateIso("151120-11-15")).toBeNull();
    expect(mkDeliveryDeadline("2026-11-15T00:00:00.000Z")).toBe("15.11.2026");
    expect(mkDeliveryDeadline(new Date(Date.UTC(151120, 10, 15)))).toBeUndefined();
  });
});
