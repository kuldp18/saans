"use client";

import { useRef, useState } from "react";
import { actions } from "@/catalog/actions";
import { alternateReasons } from "@/catalog/action-reasons";
import { activityNames } from "@/catalog/activities";
import { sources } from "@/catalog/sources";
import { timeZoneLabel } from "@/domain/air";
import type { PlanResult } from "@/domain/plan/result";
import { Card } from "./ui";

type PlanCard = PlanResult["plan"]["actions"][number];
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const fallbackText = {
  fixed: "Keep the scheduled time.",
  "outdoor-policy": "Outdoor exertion depends on current conditions and local guidance.",
  "air-unavailable": "A fresh forecast is unavailable, so a time comparison cannot be made.",
  "incomplete-baseline": "The original time is outside the forecast window or lacks a complete PM₂.₅ estimate.",
  "no-cleaner-window": "No feasible window had a lower modeled PM₂.₅ estimate.",
};

function localWindow(start: string, end: string, timeZone: string) {
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" });
  const first = Date.parse(start);
  const last = Date.parse(end);
  const dates = day.format(first) === day.format(last) ? "" : ` ${day.format(first)}–${day.format(last)}`;
  return `${clock.format(first)}–${clock.format(last)}${dates} ${timeZoneLabel(timeZone)}`;
}

function Evidence({ card, timeZone }: { card: PlanCard; timeZone: string }) {
  const { impact, adjustment } = card;
  if (!impact) return null;
  const outdoor = impact.kind === "outdoor-pm25";
  const delta = impact.delta < 0.05 ? "<0.1" : number.format(impact.delta);
  return (
    <>
      <p className="impact">
        {outdoor
          ? <><strong>{delta} µg/m³ lower</strong> modeled outdoor PM₂.₅ ({Math.round(impact.percent)}% lower, rounded).</>
          : <><strong>{delta} vehicle-km avoided</strong> if the proposed trip replaces the original travel.</>}
      </p>
      <details className="evidence">
        <summary>See the comparison</summary>
        <dl>
          <dt>Baseline{adjustment && ` · ${localWindow(adjustment.originalStart, adjustment.originalEnd, timeZone)}`}</dt>
          <dd>{number.format(impact.baseline)} {impact.unit}</dd>
          <dt>Proposed{adjustment && ` · ${localWindow(adjustment.start, adjustment.end, timeZone)}`}</dt>
          <dd>{number.format(impact.proposed)} {impact.unit}</dd>
        </dl>
        <p>{outdoor
          ? "Multiply each hourly model value by the minutes it overlaps the activity, add them up, and divide by the activity duration. Subtract the proposed average from the baseline and divide by the baseline for the percentage."
          : "Subtract proposed whole-journey private-car vehicle-km from baseline vehicle-km. Each contributing vehicle counts once."}</p>
        <p>{outdoor
          ? "The comparison uses the same duration and forecast grid. Indoor air, personal exposure, and health outcomes are outside this estimate."
          : "This is an estimate of distance, with no calculation of tailpipe emissions or change in city AQI."}</p>
      </details>
    </>
  );
}

function ActionCard({ card, timeZone }: { card: PlanCard; timeZone: string }) {
  const action = actions[card.id];
  const source = sources[card.sourceId];
  const activity = card.activityId && activityNames[card.activityId];
  const change = card.adjustment && localWindow(card.adjustment.start, card.adjustment.end, timeZone);
  const title = card.id === "keep-commitment" && activity ? `Keep ${activity.toLowerCase()} as scheduled` : action.title;
  return (
    <article className={`surface plan-action ${action.type === "advisory" ? "advisory" : ""}`}>
      <h3>{title}</h3>
      {activity && card.id !== "keep-commitment" && <p className="text-sm font-semibold text-muted">{activity}</p>}
      <dl className="action-facts">
        <dt>Why this fits</dt>
        <dd>{card.reason && card.id === "keep-commitment" ? fallbackText[card.reason]
          : (card.approvedReason === "alternate" && alternateReasons[card.id]) || action.rationale}</dd>
        <dt>What changes</dt>
        <dd>{change ? `Move this activity to ${change}.` : action.mechanism}</dd>
        <dt>Limits</dt>
        <dd>{card.id === "check-local-advisory" && card.sourceId === "OPEN-METEO-AIR"
          ? "The modeled US AQI may differ from readings reported by local authorities." : action.caveat}</dd>
      </dl>
      <Evidence card={card} timeZone={timeZone} />
      <p className="action-source"><a href={source.url}>{source.label}</a></p>
    </article>
  );
}

function CommunityNotice({ text }: { text: string }) {
  const preview = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Notice copied.");
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setStatus("Copy unavailable. The notice text is selected for manual copying.");
    }
  }
  return (
    <section aria-labelledby="community-notice">
      <h2 id="community-notice">Community notice</h2>
      <Card>
        <label htmlFor="notice-text" className="block text-sm font-semibold">Notice text</label>
        <textarea id="notice-text" className="notice-text" rows={8} readOnly value={text} ref={preview} />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="action" onClick={copy}>Copy notice</button>
          <a className="action action-secondary" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="saans-community-notice.txt">
            Download text
          </a>
        </div>
        <p className="notice-status" role="status">{status}</p>
      </Card>
    </section>
  );
}

const sections = [
  { type: "routine", title: "Today’s routine" },
  { type: "indoor", title: "Better air indoors" },
  { type: "travel", title: "Lower-emission choices" },
] as const;

export function PlanResults({ result }: { result: PlanResult }) {
  const { plan, air, notice } = result;
  const advisory = plan.actions.find(({ id }) => id === "check-local-advisory");
  return (
    <div className="results">
      {advisory && <ActionCard card={advisory} timeZone={air.timeZone} />}
      {sections.map(({ type, title }) => {
        const cards = plan.actions.filter(({ id }) => actions[id].type === type);
        return (
          <section key={type} aria-labelledby={`results-${type}`}>
            <h2 id={`results-${type}`}>{title}</h2>
            <div className="grid gap-3">
              {cards.map((card) => <ActionCard key={`${card.id}:${card.activityId ?? ""}`} card={card} timeZone={air.timeZone} />)}
              {!cards.length && <p>No confirmed alternative saves private-car distance for this routine.</p>}
            </div>
          </section>
        );
      })}
      {notice && <CommunityNotice text={notice} />}
    </div>
  );
}
