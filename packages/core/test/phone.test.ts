import { describe, expect, it } from "vitest";
import { isAllowedPhoneNumber, isE164, normalizePhoneNumber } from "../src/phone";

describe("phone numbers", () => {
  it("normalizes what people type to E.164 without guessing a country", () => {
    expect(normalizePhoneNumber(" +91 98765-43210 ")).toBe("+919876543210");
    expect(normalizePhoneNumber("+1 (415) 555-0100")).toBe("+14155550100");
    expect(normalizePhoneNumber("0044 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhoneNumber("98765 43210")).toBe("9876543210");
    expect(isE164(normalizePhoneNumber("98765 43210"))).toBe(false);
  });

  it("accepts only E.164", () => {
    expect(isE164("+919876543210")).toBe(true);
    expect(isE164("+0123456789")).toBe(false);
    expect(isE164("+12345")).toBe(false);
    expect(isE164("+1234567890123456")).toBe(false);
    expect(isE164("919876543210")).toBe(false);
  });

  it("restricts to allowed calling codes when configured", () => {
    expect(isAllowedPhoneNumber("+919876543210")).toBe(true);
    expect(isAllowedPhoneNumber("+919876543210", "91")).toBe(true);
    expect(isAllowedPhoneNumber("+14155550100", " 91 , +1 ")).toBe(true);
    expect(isAllowedPhoneNumber("+447700900123", "91,1")).toBe(false);
    expect(isAllowedPhoneNumber("not-a-number", "")).toBe(false);
  });
});
