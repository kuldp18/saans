import type { Metadata } from "next";
import Link from "next/link";
import { builtInPlace } from "@/catalog/cities";
import { DELHI_DEMO_ANCHOR } from "@/catalog/delhi-demo";
import { PlannerForm } from "@/components/planner-form";
import { presentAir } from "@/domain/air-presentation";
import { plannerDate } from "@/domain/plan/form";
import { resolvePlannerEntry } from "@/domain/planner-entry";
import { airClock, getAir } from "@/server/air/runtime";

export const metadata: Metadata = { title: "Planner" };

export default async function PlanPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const entry = resolvePlannerEntry(await searchParams);
  if (entry.kind === "invalid" || entry.kind === "choose-city") {
    return (
      <>
        <h1>Plan your day</h1>
        <p>{entry.kind === "invalid" ? "This city or data mode is unavailable. Choose a supported city or open the Delhi sample." : "Choose a city to start your routine, or open the Delhi sample."}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="action">Choose a city</Link>
          <Link href="/plan?city=delhi&mode=demo" className="action action-secondary">Try Delhi demo</Link>
        </div>
      </>
    );
  }

  const snapshot = await getAir(entry.city, entry.kind);
  if (!snapshot.location && !builtInPlace(entry.city)) return (
    <>
      <h1>City unavailable</h1>
      <p>We could not look up this city. Search again or try the Delhi sample.</p>
      <Link href="/" className="action">Search cities</Link>
    </>
  );
  const now = airClock();
  const date = plannerDate(snapshot.mode === "demo" ? Date.parse(DELHI_DEMO_ANCHOR) : now, snapshot.timeZone);
  return <PlannerForm key={`${entry.city}:${entry.kind}`} city={entry.city} mode={entry.kind} initialAir={presentAir(snapshot, now)} date={date} />;
}
