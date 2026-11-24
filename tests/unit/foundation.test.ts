import { describe, expect, it } from "vitest";
import { DELHI_DEMO_DISPLAY_AT, delhiSample } from "../../src/catalog/delhi-demo";
import { formatLocalTime, usAqiBand } from "../../src/domain/air";
import { resolvePlannerEntry } from "../../src/domain/planner-entry";

describe("planner entry", () => {
  it("requires a supported city and an explicit demo mode to show sample air", () => {
    expect(resolvePlannerEntry({})).toEqual({ kind: "choose-city" });
    expect(resolvePlannerEntry({ city: "delhi" })).toEqual({ kind: "live", city: "delhi" });
    expect(resolvePlannerEntry({ city: "noida", mode: "live" })).toEqual({ kind: "live", city: "noida" });
    expect(resolvePlannerEntry({ city: "delhi", mode: "demo" })).toEqual({
      kind: "demo", city: "delhi",
    });
  });

  it.each([
    { city: "unknown" },
    { city: "noida", mode: "demo" },
    { mode: "demo" },
    { city: ["delhi", "noida"], mode: "demo" },
    { city: "delhi", mode: ["live", "demo"] },
    { city: "delhi", mode: "forged" },
  ])("rejects invalid entry %j", (query) => {
    expect(resolvePlannerEntry(query)).toEqual({ kind: "invalid" });
  });
});

describe("sample air labels", () => {
  it("formats the fixture timestamp in Delhi local time", () => {
    expect(formatLocalTime(DELHI_DEMO_DISPLAY_AT, delhiSample.timeZone)).toBe("15 Jan 2026, 08:00");
  });

  it.each([
    [-1, null], [NaN, null], [Infinity, null], [150.5, null],
    [0, "Good"], [50, "Good"], [51, "Moderate"], [100, "Moderate"],
    [101, "Unhealthy for sensitive groups"], [150, "Unhealthy for sensitive groups"],
    [151, "Unhealthy"], [200, "Unhealthy"], [201, "Very unhealthy"],
    [300, "Very unhealthy"], [301, "Hazardous"],
  ] as const)("labels US AQI %s as %s", (value, band) => {
    expect(usAqiBand(value)).toBe(band);
  });
});
