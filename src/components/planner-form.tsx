"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { activityNames } from "@/catalog/activities";
import type { LocationId } from "@/catalog/cities";
import { delhiGoldenInput } from "@/catalog/delhi-golden";
import { timeZoneLabel, type RequestedAirMode } from "@/domain/air";
import type { AirPresentation } from "@/domain/air-presentation";
import { readPlannerForm, type FormErrors } from "@/domain/plan/form";
import type { Activity, PlanInput } from "@/domain/plan/input";
import type { PlanResult } from "@/domain/plan/result";
import { AirContext } from "./air-context";
import { PlanResults } from "./plan-results";
import { Card, SelectField, Status } from "./ui";

type ActivityId = Activity["activityId"];
const personas = ["household", "community"] as const;
const activityIds = ["school-pickup", "errand", "outdoor-group-activity"] as const;
const exampleTimes = {
  "school-pickup": { start: "15:00", end: "15:30", earliest: "15:00", latest: "15:30" },
  errand: { start: "11:00", end: "12:00", earliest: "09:00", latest: "17:00" },
  "outdoor-group-activity": { start: "10:00", end: "11:00", earliest: "09:00", latest: "16:00" },
} satisfies Record<ActivityId, { start: string; end: string; earliest: string; latest: string }>;
const commitments = [
  { label: "Fixed", value: "fixed" },
  { label: "Flexible", value: "flexible" },
];

function InputField({ label, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: string; id: string; error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : props["aria-describedby"]} {...props} />
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

function ActivityFields({ id, sample, active, errors }: { id: ActivityId; sample: boolean; active: boolean; errors: FormErrors }) {
  const original = sample ? delhiGoldenInput.activities.find(({ activityId }) => activityId === id) : undefined;
  const example = exampleTimes[id];
  const [flexibility, setFlexibility] = useState(original?.flexibility ?? (id === "school-pickup" ? "fixed" : "flexible"));
  const start = original?.start.slice(11, 16) ?? (sample ? "08:30" : example.start);
  const end = original?.end.slice(11, 16) ?? (sample ? "09:30" : example.end);
  const earliest = original?.flexibility === "flexible" ? original.earliestStart.slice(11, 16) : sample ? start : example.earliest;
  const latest = original?.flexibility === "flexible" ? original.latestEnd.slice(11, 16) : sample ? end : example.latest;
  return (
    <fieldset className="activity" hidden={!active} disabled={!active}>
      <legend>{activityNames[id]}</legend>
      <div className="grid gap-4">
        <SelectField name={`${id}-flexibility`} label="Schedule flexibility" options={commitments} value={flexibility}
          onChange={(event) => setFlexibility(event.target.value === "fixed" ? "fixed" : "flexible")} />
        <div className="time-fields grid gap-3">
          <InputField id={`${id}-start`} type="time" label="Start time" step={1800} defaultValue={start} error={errors[`${id}-start`]} />
          <InputField id={`${id}-end`} type="time" label="End time" defaultValue={end} error={errors[`${id}-end`]} />
        </div>
        <div hidden={flexibility === "fixed"} className="time-fields grid gap-3">
          <InputField id={`${id}-earliest`} type="time" label="Earliest feasible start" defaultValue={earliest} error={errors[`${id}-earliest`]} />
          <InputField id={`${id}-latest`} type="time" label="Latest feasible finish" defaultValue={latest} error={errors[`${id}-latest`]} />
        </div>
      </div>
    </fieldset>
  );
}

function TravelFields({ sample, errors }: { sample: boolean; errors: FormErrors }) {
  const [option, setOption] = useState(sample ? "combine" : "unchanged");
  const [confirmed, setConfirmed] = useState(sample);
  return (
    <fieldset>
      <legend>Travel alternatives</legend>
      <div className="grid gap-3">
        <SelectField label="Travel option" name="travel-option" value={option} onChange={(event) => setOption(event.target.value)} options={[
          { value: "unchanged", label: "Keep current travel" },
          { value: "combine", label: "Combine car trips" },
          { value: "share", label: "Share a ride" },
          { value: "transit", label: "Use public transport" },
        ]} />
        <label className="check-option" hidden={option === "unchanged"}>
          <input type="checkbox" name="travel-confirmed" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          This option can replace the original car travel
        </label>
        <div hidden={option === "unchanged" || !confirmed}>
          <p className="text-sm text-muted">Count whole journeys in kilometres (km), including any private-car connection.</p>
          <div className="time-fields grid gap-3">
            <InputField id="travel-before" type="number" min={0} max={500} step="any" inputMode="decimal"
              label="Current private-car distance (km)" placeholder={sample ? undefined : "e.g. 8"} defaultValue={sample ? delhiGoldenInput.travel?.baseline[0]?.km : undefined} error={errors["travel-before"]} />
            <InputField id="travel-after" type="number" min={0} max={500} step="any" inputMode="decimal"
              label="Proposed private-car distance (km)" placeholder={sample ? undefined : "e.g. 5"} defaultValue={sample ? delhiGoldenInput.travel?.proposed[0]?.km : undefined} error={errors["travel-after"]} />
          </div>
        </div>
      </div>
    </fieldset>
  );
}

export function PlannerForm({ city, mode, initialAir, date }: {
  city: LocationId; mode: RequestedAirMode; initialAir: AirPresentation; date: string;
}) {
  const sample = mode === "demo";
  const [persona, setPersona] = useState<PlanInput["persona"]>("household");
  const [selection, setSelection] = useState<Record<PlanInput["persona"], ActivityId[]>>({
    household: ["school-pickup", "errand"],
    community: ["outdoor-group-activity"],
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PlanResult | null>(null);
  const summary = useRef<HTMLElement>(null);
  const planHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const focusTarget = useRef<"errors" | "result" | "form" | null>(null);

  useEffect(() => {
    const targets = { errors: summary, result: planHeading, form: formHeading };
    if (focusTarget.current) targets[focusTarget.current].current?.focus();
    focusTarget.current = null;
  }, [errors, result]);

  function toggleActivity(id: ActivityId, checked: boolean) {
    setErrors({});
    setSelection((previous) => ({
      ...previous,
      [persona]: activityIds.filter((activity) => activity === id ? checked : previous[persona].includes(activity)),
    }));
  }

  function showErrors(nextErrors: FormErrors) {
    focusTarget.current = "errors";
    setErrors(nextErrors);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft = readPlannerForm(new FormData(event.currentTarget), persona, selection[persona], initialAir.timeZone);
    if (!draft.ok) {
      showErrors(draft.errors);
      return;
    }
    setErrors({});
    setPending(true);
    setMessage("Building your plan.");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, mode, profile: draft.profile }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        const errors: Record<number, string> = {
          400: "The plan could not use these choices. Review your routine and try again.",
          403: "This address is not allowed to submit plans. Open Saans at its configured address.",
          404: "This city could not be found. Search for it again or choose another city.",
          429: "Too many plan requests. Wait a moment before trying again.",
        };
        showErrors({ "form-error": errors[response.status] ?? "Plan generation is unavailable. Your entries are still here. Try again." });
        return;
      }
      const plan: PlanResult = await response.json();
      focusTarget.current = "result";
      setResult(plan);
      setMessage("Plan ready.");
    } catch {
      showErrors({ "form-error": "Could not reach the planner. Your entries are still here. Try again." });
    } finally {
      setPending(false);
    }
  }

  function edit() {
    focusTarget.current = "form";
    setResult(null);
    setMessage("");
  }

  return (
    <>
      <div hidden={!!result}>
        <h1 ref={formHeading} tabIndex={-1}>Plan your day</h1>
        <p className="planner-city"><strong>{initialAir.cityName}</strong> <Link href="/">Change city</Link></p>
      </div>
      {result && (
        <div className="mb-5">
          <Status tone="sample">{result.plan.method === "ai-ranked" ? "AI-ranked plan" : "Rules plan"}</Status>
          {result.aiUnavailable && <p className="text-sm text-muted">AI ranking is unavailable. This plan uses rules.</p>}
          <h1 ref={planHeading} tabIndex={-1}>Your plan for {result.air.cityName}</h1>
          <button type="button" className="action action-secondary" onClick={edit}>Edit routine</button>
        </div>
      )}
      <div className="planner-grid">
        <aside className="planner-air" aria-label="Air context">
          <AirContext air={result?.air ?? initialAir} />
          {!sample && <Link className="action action-secondary mt-3" href="/plan?city=delhi&mode=demo">Use Delhi sample data</Link>}
        </aside>
        <div className="planner-fields" hidden={!!result}>
          <h2>Your routine</h2>
          <Card>
            <form className="planner-form" aria-label="Daily routine" aria-describedby={sample ? undefined : "routine-examples"}
              action="/api/plan" method="post" onSubmit={submit} noValidate>
              {!sample && <p id="routine-examples" className="text-sm text-muted">The activity times are examples. Edit them to match your schedule, or use them to try the planner.</p>}
              {Object.keys(errors).length > 0 && (
                <section className="error-summary" aria-labelledby="error-heading" tabIndex={-1} ref={summary}>
                  <h3 id="error-heading">Check your entries</h3>
                  <ul>
                    {Object.entries(errors).map(([id, error]) => (
                      <li key={id}>{id === "form-error" ? error : <a href={`#${id}`}>{error}</a>}</li>
                    ))}
                  </ul>
                </section>
              )}
              <fieldset disabled={pending} className="grid gap-5">
                <fieldset>
                  <legend>Who are you planning for?</legend>
                  <div className="choices">
                    {personas.map((value) => (
                      <label key={value}>
                        <input type="radio" name="persona" value={value} checked={value === persona}
                          onChange={() => { setErrors({}); setPersona(value); }} />
                        {value === "household" ? "Household" : "Community"}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-2">
                  <InputField label="Planning date" type="date" id="planning-date" defaultValue={date} error={errors["planning-date"]} />
                  <p className="text-sm text-muted">Times are in {timeZoneLabel(initialAir.timeZone)}. An end time earlier than the start is treated as the next day.</p>
                </div>

                <fieldset id="activity-selection" tabIndex={-1}
                  aria-describedby={errors["activity-selection"] ? "activity-selection-error" : undefined}>
                  <legend>Which activities are you planning?</legend>
                  {activityIds.map((id) => (
                    <label className="check-option" key={id}>
                      <input type="checkbox" checked={selection[persona].includes(id)}
                        onChange={(event) => toggleActivity(id, event.target.checked)} />
                      Include {activityNames[id].toLowerCase()}
                    </label>
                  ))}
                  {errors["activity-selection"] && <p id="activity-selection-error" className="field-error">{errors["activity-selection"]}</p>}
                </fieldset>
                {activityIds.map((id) => (
                  <ActivityFields key={id} id={id} sample={sample} active={selection[persona].includes(id)} errors={errors} />
                ))}
                <fieldset hidden={persona !== "household"} disabled={persona !== "household"}>
                  <legend>At home</legend>
                  <div className="grid gap-3">
                    <SelectField label="Budget" name="budget" options={[
                      { value: "no-purchases", label: "No purchases" },
                      { value: "existing", label: "Use existing equipment" },
                      { value: "open", label: "Open to purchases" },
                    ]} />
                    <SelectField label="Suitable particle filter" name="filter" options={[
                      { value: "unavailable", label: "Unavailable" },
                      { value: "available", label: "Already available" },
                      { value: "considering", label: "Considering a purchase" },
                    ]} />
                  </div>
                </fieldset>
                <fieldset hidden={persona !== "community"} disabled={persona !== "community"}>
                  <legend>Venue</legend>
                  <SelectField label="Indoor venue" name="venue" defaultValue={sample ? "available" : "unknown"} options={[
                    { value: "unknown", label: "Not sure" },
                    { value: "available", label: "Available" },
                    { value: "unavailable", label: "Unavailable" },
                  ]} />
                </fieldset>
                <label className="check-option">
                  <input type="checkbox" name="cautious" /> Use a more cautious rule for outdoor exertion
                </label>
                <TravelFields sample={sample} errors={errors} />
              </fieldset>
              <div>
                <p className="text-sm text-muted">Saans uses rules to build this plan.</p>
                <button type="submit" className="action" disabled={pending}>{pending ? "Building plan…" : "Generate plan"}</button>
              </div>
            </form>
          </Card>
        </div>
        {result && <div className="planner-fields"><PlanResults result={result} /></div>}
      </div>
      <p role="status" className="sr-only">{message}</p>
    </>
  );
}
