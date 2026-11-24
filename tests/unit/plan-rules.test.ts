import { describe, expect, it } from "vitest";
import { DELHI_DEMO_ANCHOR, delhiSample } from "../../src/catalog/delhi-demo";
import { delhiGoldenInput } from "../../src/catalog/delhi-golden";
import { actions } from "../../src/catalog/actions";
import { AIR_FRESH_MS, airSnapshotSchema, formatLocalTime, HOUR_MS, unavailableAir, type AirSnapshot } from "../../src/domain/air";
import { compareOutdoorPm25, comparePrivateCarKm, createWindowReader } from "../../src/domain/plan/impact";
import { parsePlanInput, type Activity, type PlanInput } from "../../src/domain/plan/input";
import { buildRulesPlan } from "../../src/domain/plan/rules";

const anchor = Date.parse(DELHI_DEMO_ANCHOR);
const at = (value: string) => Date.parse(`2026-01-15T${value}:00+05:30`);
const fixedOutdoor: Activity = {
  activityId: "outdoor-group-activity",
  flexibility: "fixed",
  start: "2026-01-15T08:30:00+05:30",
  end: "2026-01-15T09:30:00+05:30",
};

function demoWithAqi(aqi: number | null): AirSnapshot {
  return { ...delhiSample, hourly: delhiSample.hourly.map((hour) => ({ ...hour, usAqi: aqi })) };
}

describe("air snapshot and impact", () => {
  it("accepts the canonical synthetic snapshot and formats UTC across Delhi date rollover", () => {
    expect(airSnapshotSchema.parse(delhiSample)).toEqual(delhiSample);
    expect(formatLocalTime("2026-01-15T19:00:00Z", delhiSample.timeZone)).toBe("16 Jan 2026, 00:30");
  });

  it("weights overlapping minutes and treats the interval end as exclusive", () => {
    const read = createWindowReader(delhiSample);
    expect(read({ start: at("08:30"), end: at("09:30") })?.pm25UgM3).toBe(110);
    expect(read({ start: at("13:30"), end: at("14:30") })?.pm25UgM3).toBe(50);
    expect(read({ start: at("08:00"), end: at("09:00") })?.pm25UgM3).toBe(120);
    expect(read({ start: at("08:30"), end: at("09:10") })?.pm25UgM3).toBe(115);
  });

  it("distinguishes zero, missing PM₂.₅, missing AQI, and a missing bin", () => {
    const hourly = delhiSample.hourly.map((hour, index) => index === 1
      ? { ...hour, pm25UgM3: null, usAqi: 0 }
      : index === 2 ? { ...hour, pm25UgM3: 0, usAqi: null } : hour);
    const read = createWindowReader({ ...delhiSample, hourly });
    expect(read({ start: at("08:00"), end: at("09:00") })).toEqual({ pm25UgM3: null, maxUsAqi: 0, aqiComplete: true });
    expect(read({ start: at("09:00"), end: at("10:00") })).toEqual({ pm25UgM3: 0, maxUsAqi: null, aqiComplete: false });
    const gap = createWindowReader({ ...delhiSample, hourly: hourly.filter((_, index) => index !== 2) });
    expect(gap({ start: at("09:00"), end: at("10:00") })?.pm25UgM3).toBeNull();
    expect(compareOutdoorPm25(0, 0)).toBeNull();
    expect(compareOutdoorPm25(40, 60)).toBeNull();
  });

  it("counts each contributing vehicle once and checks actual feasibility", () => {
    const travel = delhiGoldenInput.travel!;
    expect(comparePrivateCarKm({ ...travel, baseline: [...travel.baseline, ...travel.baseline] })).toMatchObject({
      baseline: 16, proposed: 10, delta: 6,
    });
    expect(comparePrivateCarKm({ ...travel, baseline: [...travel.baseline, { vehicleId: "car-1", km: 6 }] })).toBeNull();
    expect(comparePrivateCarKm({ ...travel, feasible: false })).toBeNull();
    expect(comparePrivateCarKm({ ...travel, proposed: [] })).toBeNull();
    expect(comparePrivateCarKm({ ...travel, kind: "replace", proposed: [] })?.delta).toBe(16);
  });
});

describe("deterministic action eligibility", () => {
  it("reproduces the golden household plan from the versioned sample anchor", () => {
    const plan = buildRulesPlan(delhiGoldenInput, delhiSample, Date.parse("2030-01-01T00:00:00Z"));
    expect(plan.actions[0].id).toBe("check-local-advisory");
    expect(plan.actions.filter(({ activityId }) => activityId === "school-pickup")).toEqual([
      { id: "keep-commitment", sourceId: "CPCB-INDIA", activityId: "school-pickup", reason: "fixed" },
    ]);
    const errand = plan.actions.find(({ id }) => id === "shift-flexible-activity");
    expect(errand).toMatchObject({
      sourceId: "SAANS-DELHI-SAMPLE",
      adjustment: { start: "2026-01-15T08:00:00.000Z", end: "2026-01-15T09:00:00.000Z" },
      impact: { baseline: 110, proposed: 50, delta: 60, unit: "µg/m³" },
    });
    const metric = errand?.impact;
    expect(metric?.kind === "outdoor-pm25" && Math.round(metric.percent)).toBe(55);
    expect(plan.actions.find(({ id }) => id === "combine-car-trips")?.impact).toMatchObject({
      baseline: 16, proposed: 10, delta: 6, unit: "vehicle-km",
    });
    expect(plan.actions).toContainEqual({ id: "skip-incense-and-candles", sourceId: "EPA-HOME" });
    expect(actions["skip-incense-and-candles"].mechanism).toContain("smoke particles indoors");
    expect(plan.actions.some(({ id }) => id.includes("particle-filter"))).toBe(false);
  });

  it.each([
    [100, true, "keep-commitment"], [101, true, "pause-outdoor-activity"],
    [150, false, "keep-commitment"], [151, false, "pause-outdoor-activity"],
    [200, false, "pause-outdoor-activity"], [201, false, "pause-outdoor-activity"],
    [null, false, "pause-outdoor-activity"],
  ] as const)("applies optional activity policy at AQI %s with cautious mode %s", (aqi, cautious, id) => {
    const profile: PlanInput = { ...delhiGoldenInput, activities: [fixedOutdoor], cautious };
    const plan = buildRulesPlan(profile, demoWithAqi(aqi), anchor);
    expect(plan.actions.find(({ activityId }) => activityId === fixedOutdoor.activityId)?.id).toBe(id);
    expect(plan.actions[0].id === "check-local-advisory").toBe(aqi === 201);
  });

  it("uses the peak even when one overlapping AQI value is missing", () => {
    const base = demoWithAqi(90);
    const hourly = base.hourly.map((hour, index) => index === 1 ? { ...hour, usAqi: 201 }
      : index === 2 ? { ...hour, usAqi: null } : hour);
    const plan = buildRulesPlan({
      ...delhiGoldenInput, persona: "community", activities: [fixedOutdoor], indoorVenueAvailable: true,
    }, { ...base, hourly }, anchor);
    expect(plan.actions.slice(0, 2).map(({ id }) => id)).toEqual(["check-local-advisory", "move-activity-indoors"]);
  });

  it("keeps time comparisons unavailable for stale, expired or missing air", () => {
    const model: AirSnapshot = {
      ...delhiSample, sourceId: "OPEN-METEO-AIR", fetchedAt: DELHI_DEMO_ANCHOR, mode: "stale-model",
    };
    for (const snapshot of [model, { ...model, mode: "live-model" } as const, unavailableAir("delhi")]) {
      const plan = buildRulesPlan(delhiGoldenInput, snapshot, anchor + AIR_FRESH_MS);
      expect(plan.actions.find(({ activityId }) => activityId === "errand")).toMatchObject({
        id: "keep-commitment", reason: "air-unavailable",
      });
      expect(plan.actions.every(({ impact }) => impact?.kind !== "outdoor-pm25")).toBe(true);
      expect(plan.actions.some(({ id }) => id === "combine-car-trips")).toBe(true);
    }
  });

  it("retains the errand when the baseline is incomplete or no cleaner feasible window exists", () => {
    const noBaseline = { ...delhiSample, hourly: delhiSample.hourly.filter((_, index) => index !== 2) };
    const flat = { ...delhiSample, hourly: delhiSample.hourly.map((hour) => ({ ...hour, pm25UgM3: 90 })) };
    for (const [snapshot, reason] of [[noBaseline, "incomplete-baseline"], [flat, "no-cleaner-window"]] as const) {
      expect(buildRulesPlan(delhiGoldenInput, snapshot, anchor).actions.find(({ activityId }) => activityId === "errand"))
        .toMatchObject({ id: "keep-commitment", reason });
    }
  });

  it("prefers the earliest equal cleaner choice and rejects impossible routines", () => {
    const hourly = delhiSample.hourly.map((hour, i) => ({ ...hour, pm25UgM3: i >= 4 && i <= 7 ? 50 : 100 }));
    const plan = buildRulesPlan(delhiGoldenInput, { ...delhiSample, hourly }, anchor);
    expect(plan.actions.find(({ id }) => id === "shift-flexible-activity")?.adjustment?.start)
      .toBe(new Date(anchor + 4 * HOUR_MS).toISOString());
    expect(parsePlanInput({ ...delhiGoldenInput, activities: [fixedOutdoor, fixedOutdoor] }).success).toBe(false);
    expect(parsePlanInput({ ...delhiGoldenInput, activities: [{ ...fixedOutdoor, end: fixedOutdoor.start }] }).success).toBe(false);
  });
});
