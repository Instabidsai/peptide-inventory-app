import { describe, it, expect } from "vitest";
import { parseAddress } from "../../api/shipping/_shared";

describe("parseAddress", () => {
  it("parses a standard US address with comma separation", () => {
    const result = parseAddress("123 Main St, Springfield, IL 62701");
    expect(result).toEqual({
      street1: "123 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "US",
    });
  });

  it("parses address with full state name", () => {
    const result = parseAddress("456 Oak Ave, Miami, Florida 33101");
    expect(result).toEqual({
      street1: "456 Oak Ave",
      city: "Miami",
      state: "FL",
      zip: "33101",
      country: "US",
    });
  });

  it("parses address with zip+4", () => {
    const result = parseAddress("789 Pine Rd, Austin, TX 78701-1234");
    expect(result).toEqual({
      street1: "789 Pine Rd",
      city: "Austin",
      state: "TX",
      zip: "78701-1234",
      country: "US",
    });
  });

  it("parses address without trailing country", () => {
    const result = parseAddress("100 Broadway, New York, NY 10001");
    expect(result).toEqual({
      street1: "100 Broadway",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
  });

  it("returns null when USA appears after zip (known limitation)", () => {
    // parseAddress expects zip at end of string; trailing "USA" breaks zip regex
    expect(parseAddress("100 Broadway, New York, NY 10001, USA")).toBeNull();
  });

  it("handles newlines as separators", () => {
    const result = parseAddress("200 Elm St\nDenver\nCO 80201");
    expect(result).not.toBeNull();
    expect(result!.state).toBe("CO");
    expect(result!.zip).toBe("80201");
  });

  it("returns null for empty string", () => {
    expect(parseAddress("")).toBeNull();
  });

  it("returns null for too-short input", () => {
    expect(parseAddress("hi")).toBeNull();
  });

  it("returns null for address without zip code", () => {
    expect(parseAddress("123 Main St, Springfield, IL")).toBeNull();
  });

  it("falls back to zip-based state for FL", () => {
    const result = parseAddress("500 Ocean Dr, Miami Beach 33139");
    expect(result).not.toBeNull();
    expect(result!.state).toBe("FL");
  });
});
