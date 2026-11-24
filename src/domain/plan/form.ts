import { z } from "zod";
import { activityNames } from "../../catalog/activities";
import { parsePlanInput, type Activity, type PlanInput } from "./input";

export type FormErrors = Record<string, string>;
type ActivityId = Activity["activityId"];
const clockTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function plannerDate(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"].map((part) => parts.find(({ type }) => type === part)?.value).join("-");
}

function timestamp(date: string, time: string, nextDay = false) {
  const day = nextDay ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
  return `${day}T${time}:00+05:30`;
}

export function readPlannerForm(form: FormData, persona: PlanInput["persona"], selected: ActivityId[]) {
  const read = (name: string) => String(form.get(name) ?? "");
  const errors: FormErrors = {};
  const date = read("planning-date");
  const validDate = z.iso.date().safeParse(date).success;
  if (!validDate) errors["planning-date"] = "Enter a valid planning date.";
  if (!selected.length) errors["activity-selection"] = "Choose at least one activity.";

  const activities = selected.flatMap<Activity>((activityId) => {
    const label = activityNames[activityId];
    const startKey = `${activityId}-start`;
    const endKey = `${activityId}-end`;
    const start = read(startKey);
    const end = read(endKey);
    const flexible = read(`${activityId}-flexibility`) === "flexible";
    const earliestKey = `${activityId}-earliest`;
    const latestKey = `${activityId}-latest`;
    const earliest = read(earliestKey);
    const latest = read(latestKey);
    if (!clockTime.test(start) || ![":00", ":30"].some((minute) => start.endsWith(minute))) {
      errors[startKey] = `${label}: choose a start time on the hour or half-hour.`;
    }
    if (!clockTime.test(end)) errors[endKey] = `${label}: enter an end time.`;
    if (flexible && !clockTime.test(earliest)) errors[earliestKey] = `${label}: enter the earliest feasible start.`;
    if (flexible && !clockTime.test(latest)) errors[latestKey] = `${label}: enter the latest feasible finish.`;
    if (!validDate || errors[startKey] || errors[endKey] || errors[earliestKey] || errors[latestKey]) return [];

    const startAt = timestamp(date, start);
    const endAt = timestamp(date, end, end < start);
    const minutes = (Date.parse(endAt) - Date.parse(startAt)) / 60_000;
    if (minutes < 30 || minutes > 120) errors[endKey] = `${label}: allow 30 to 120 minutes between start and end.`;
    if (!flexible) return [{ activityId, flexibility: "fixed" as const, start: startAt, end: endAt }];

    const earliestStart = timestamp(date, earliest);
    const latestEnd = timestamp(date, latest, latest < start);
    if (Date.parse(earliestStart) > Date.parse(startAt)) errors[earliestKey] = `${label}: the feasible start must be at or before the scheduled start.`;
    if (Date.parse(latestEnd) < Date.parse(endAt)) errors[latestKey] = `${label}: the feasible finish must be at or after the scheduled end.`;
    return [{ activityId, flexibility: "flexible" as const, start: startAt, end: endAt, earliestStart, latestEnd }];
  });

  let travel: PlanInput["travel"];
  const option = read("travel-option");
  if (option !== "unchanged" && form.has("travel-confirmed")) {
    const before = Number(read("travel-before"));
    const after = Number(read("travel-after"));
    if (!read("travel-before") || !Number.isFinite(before) || before <= 0 || before > 500) {
      errors["travel-before"] = "Enter the current private-car distance, above 0 and at most 500 km.";
    }
    if (!read("travel-after") || !Number.isFinite(after) || after < 0 || after > 500 || (option === "combine" && after === 0)) {
      errors["travel-after"] = option === "combine"
        ? "Enter the combined car distance, above 0 and at most 500 km."
        : "Enter the proposed private-car distance, from 0 to 500 km.";
    }
    travel = {
      kind: option === "combine" ? "consolidate" : "replace",
      feasible: true,
      baseline: [{ vehicleId: "car-1", km: before }],
      proposed: after > 0 ? [{ vehicleId: "car-1", km: after }] : [],
    };
  }

  if (Object.keys(errors).length) return { ok: false, errors } as const;
  const parsed = parsePlanInput({
    persona,
    activities,
    cautious: form.has("cautious"),
    budget: read("budget") || "no-purchases",
    suitableFilter: read("filter") || "unavailable",
    indoorVenueAvailable: read("venue") === "available",
    ...(travel ? { travel } : {}),
  });
  return parsed.success
    ? { ok: true, profile: parsed.data } as const
    : { ok: false, errors: { "form-error": "Check the routine and travel choices before trying again." } } as const;
}
