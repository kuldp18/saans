import { expect, it } from "vitest";
import { delhiGoldenInput } from "../../src/catalog/delhi-golden";
import { airSnapshotSchema } from "../../src/domain/air";
import { presentAir } from "../../src/domain/air-presentation";
import { plannerDate, readPlannerForm } from "../../src/domain/plan/form";
import { buildCommunityNotice } from "../../src/domain/plan/notice";
import { buildRulesPlan } from "../../src/domain/plan/rules";

function fields(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const errand = {
  "planning-date": "2026-01-15",
  "errand-start": "23:30", "errand-end": "00:30", "errand-flexibility": "flexible",
  "errand-earliest": "23:00", "errand-latest": "01:00", "travel-option": "unchanged",
};

it("normalizes midnight rollover and uses the city-local day instead of the host day", () => {
  expect(plannerDate(Date.parse("2026-01-15T19:00:00Z"), "Asia/Kolkata")).toBe("2026-01-16");
  expect(readPlannerForm(fields(errand), "household", ["errand"])).toMatchObject({
    ok: true, profile: { activities: [{
      start: "2026-01-15T23:30:00+05:30", end: "2026-01-16T00:30:00+05:30",
      latestEnd: "2026-01-16T01:00:00+05:30",
    }] },
  });
});

it("rejects incompatible bounds, time increments, and empty routines with field names", () => {
  expect(readPlannerForm(fields({ ...errand, "errand-latest": "00:00" }), "household", ["errand"]))
    .toMatchObject({ ok: false, errors: { "errand-latest": expect.any(String) } });
  expect(readPlannerForm(fields({ ...errand, "errand-start": "23:15", "errand-earliest": "" }), "household", ["errand"]))
    .toMatchObject({ ok: false, errors: { "errand-start": expect.any(String), "errand-earliest": expect.any(String) } });
  expect(readPlannerForm(fields({ "planning-date": "2026-02-30" }), "community", []))
    .toMatchObject({ ok: false, errors: { "planning-date": expect.any(String), "activity-selection": expect.any(String) } });
});

it("only scores confirmed feasible car travel and validates both distance fields", () => {
  const travel = { ...errand, "travel-option": "combine", "travel-confirmed": "", "travel-before": "600", "travel-after": "0" };
  expect(readPlannerForm(fields(travel), "community", ["errand"]))
    .toMatchObject({ ok: false, errors: { "travel-before": expect.any(String), "travel-after": expect.any(String) } });
  const unconfirmed = fields(travel);
  unconfirmed.delete("travel-confirmed");
  const draft = readPlannerForm(unconfirmed, "community", ["errand"]);
  expect(draft.ok && draft.profile.travel).toBeUndefined();
  const replaced = fields({ ...travel, "travel-before": "5", "travel-option": "transit" });
  expect(readPlannerForm(replaced, "community", ["errand"])).toMatchObject({
    ok: true, profile: { travel: { kind: "replace", proposed: [] } },
  });
});

it("uses only stale public provenance and agreed general actions in a community notice", () => {
  const now = Date.parse("2026-01-15T02:45:00Z");
  const snapshot = airSnapshotSchema.parse({
    cityId: "noida", mode: "stale-model", sourceId: "OPEN-METEO-AIR", timeZone: "Asia/Kolkata",
    fetchedAt: "2026-01-15T02:15:00Z",
    hourly: [{ validAt: "2026-01-15T02:00:00Z", usAqi: 220, pm25UgM3: 130 }],
  });
  const profile = { ...delhiGoldenInput, persona: "community" as const };
  const notice = buildCommunityNotice(buildRulesPlan(profile, snapshot, now), presentAir(snapshot, now));
  expect(notice).toContain("Noida · Community air notice");
  expect(notice).toContain("Stale model estimate");
  expect(notice).toContain("Data valid 15 Jan 2026, 07:30 IST");
  expect(notice).toContain("Forecast source: https://open-meteo.com/");
  expect(notice).not.toMatch(/08:30|school pickup|no-purchases|car-1|vehicle-km/);
});
