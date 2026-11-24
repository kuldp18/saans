import { sources } from "@/catalog/sources";
import { formatLocalTime, usAqiBand } from "@/domain/air";
import type { AirPresentation } from "@/domain/air-presentation";
import { Card, Status } from "./ui";

export function OfficialAirLink() {
  return (
    <p className="text-sm text-muted">
      Follow local advisories. <a href={sources["CPCB-INDIA"].url} rel="noreferrer">{sources["CPCB-INDIA"].label}</a>{" "}
      use India’s AQI scale.
    </p>
  );
}

export function AirContext({ air }: { air?: AirPresentation }) {
  const sample = air?.mode === "demo";
  const stale = air?.mode === "stale-model";
  const hour = air?.hour;
  return (
    <Card>
      <h2>{sample ? "Delhi sample air" : "Air data"}</h2>
      {air && hour ? (
        <>
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
            <time dateTime={hour.validAt}>{formatLocalTime(hour.validAt, air.timeZone)} IST</time>
            {" · "}<a href={sources[air.sourceId].url}>{sources[air.sourceId].label}</a>
          </p>
          {stale && <p className="text-sm text-muted">Time-specific comparisons are unavailable with stale data.</p>}
        </>
      ) : (
        <>
          {air ? <><Status>Live forecast unavailable</Status><p>Use the Delhi sample to explore the planner.</p></>
            : <p>Select a city to see its model forecast, or try the dated Delhi sample.</p>}
        </>
      )}
      <OfficialAirLink />
    </Card>
  );
}
