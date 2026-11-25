import { sources } from "@/catalog/sources";
import { formatLocalTime, timeZoneLabel, usAqiBand } from "@/domain/air";
import type { AirPresentation } from "@/domain/air-presentation";
import { indiaAqiBand } from "@/domain/india-aqi";
import { Card, Status } from "./ui";

export function OfficialAirLink() {
  return (
    <p className="text-sm text-muted">
      Follow local advisories. See <a href={sources["CPCB-INDIA"].url} rel="noreferrer">{sources["CPCB-INDIA"].label}</a> for station-level data.
    </p>
  );
}

export function AirContext({ air }: { air?: AirPresentation }) {
  const sample = air?.mode === "demo";
  const stale = air?.mode === "stale-model";
  const hour = air?.hour;
  const india = air?.indiaAqi;
  return (
    <Card>
      <h2>{sample ? "Delhi sample air" : "Air data"}</h2>
      {air ? <div className="air-index-panels">
        {air.countryCode === "IN" && <section aria-label="India AQI">
          <h3 className="mb-2 text-base font-bold">India AQI</h3>
          {india ? (
            <>
              <p className="mb-2"><strong className="reading">{india.value}</strong> {indiaAqiBand(india.value)}</p>
              <p className="mb-0 text-sm text-muted">
                <a href={india.bulletinUrl} rel="noreferrer">{sources[india.sourceId].label}</a>
                {" · "}<time dateTime={india.validAt}>{formatLocalTime(india.validAt, air.timeZone)} IST</time>
              </p>
            </>
          ) : <p className="text-sm text-muted">{sample ? "CPCB data is separate from the sample." : "CPCB bulletin reading unavailable."}</p>}
        </section>}
        <section aria-label="US AQI and outdoor PM₂.₅">
        {hour ? <>
          <Status tone={sample ? "sample" : "neutral"}>
            {sample ? "Sample scenario" : stale ? "Stale model estimate" : "Model estimate"}
          </Status>
          <dl className="air-values">
            <div>
              <dt>Modeled US AQI</dt>
              <dd>{hour.usAqi === null ? "Unavailable" : <><strong className="reading">{hour.usAqi}</strong> {usAqiBand(hour.usAqi)}</>}</dd>
            </div>
            <div>
              <dt>Outdoor PM₂.₅</dt>
              <dd><strong>{hour.pm25UgM3 === null ? "Unavailable" : `${hour.pm25UgM3} µg/m³`}</strong></dd>
            </div>
          </dl>
          <p className="text-sm text-muted">
            <time dateTime={hour.validAt}>{formatLocalTime(hour.validAt, air.timeZone)} {timeZoneLabel(air.timeZone)}</time>
            {" · "}<a href={sources[air.sourceId].url}>{sources[air.sourceId].label}</a>
          </p>
          {stale && <p className="text-sm text-muted">Time-specific comparisons are unavailable with stale data.</p>}
        </> : <><h3 className="mb-2 text-base font-bold">US AQI</h3><Status>Live forecast unavailable</Status><p className="text-sm">Use the Delhi sample to explore the planner.</p></>}
        </section>
      </div> : <p>Select a city to see its air data, or try the dated Delhi sample.</p>}
      {air?.countryCode === "IN" && <p className="text-sm text-muted">India AQI and US AQI use different thresholds and reference periods. The readings can differ.</p>}
      {(!air || air.countryCode === "IN") ? <OfficialAirLink /> : <p className="text-sm text-muted">Follow your local air quality advisories.</p>}
    </Card>
  );
}
