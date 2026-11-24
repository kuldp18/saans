import type { Metadata } from "next";
import { sources } from "@/catalog/sources";
import { OfficialAirLink } from "@/components/air-context";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Sources" };

export default function SourcesPage() {
  return (
    <>
      <h1>Sources</h1>
      <div className="grid max-w-3xl gap-4">
        <Card>
          <h2>Air data and local guidance</h2>
          <dl className="source-list">
            <dt>Sample scenario</dt>
            <dd>The dated Delhi fixture contains synthetic US AQI and outdoor PM₂.₅ values.</dd>
            <dt>Model estimate</dt>
            <dd>Open-Meteo’s CAMS Global forecast estimates outdoor air at roughly 45 km resolution.</dd>
            <dt>Stale model estimate</dt>
            <dd>A cached forecast can be shown for up to two hours after it was fetched. Time comparisons require fresh data.</dd>
            <dt>Live forecast unavailable</dt>
            <dd>The forecast is disabled or usable data could not be retrieved. The Delhi sample is available on request.</dd>
          </dl>
          <ul className="source-links">
            <li><a href="https://www.airnow.gov/aqi/aqi-basics/" rel="noreferrer">AirNow US AQI categories</a></li>
            <li><a href={sources["OPEN-METEO-AIR"].url} rel="noreferrer">Open-Meteo air quality forecast and CAMS coverage</a></li>
          </ul>
          <OfficialAirLink />
        </Card>
        <Card>
          <h2>Home and travel</h2>
          <p>PM₂.₅ is a concentration in micrograms per cubic meter (µg/m³). Vehicle-kilometers describe the distance traveled by vehicles.</p>
          <ul className="source-links">
            <li><a href="https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home" rel="noreferrer">EPA guide to home air cleaners</a></li>
            <li><a href="https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle" rel="noreferrer">EPA guide to passenger vehicle emissions</a></li>
          </ul>
        </Card>
        <Card>
          <h2>Planner privacy</h2>
          <p>Saans sends routine choices to its planner when you generate a plan. It uses them for that request. Community notices contain public air data and general actions. AI is off in the sample.</p>
        </Card>
      </div>
    </>
  );
}
