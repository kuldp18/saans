import { builtInPlace, locationIdSchema } from "@/catalog/cities";
import { getAir } from "@/server/air/runtime";
import { createRequestGate } from "@/server/http/rate-limit";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const gate = createRequestGate(120);

export async function GET(request: Request) {
  const retry = gate();
  if (retry) {
    return Response.json({ error: { code: "rate_limited" } }, {
      status: 429, headers: { ...headers, "Retry-After": String(retry) },
    });
  }
  const query = new URL(request.url).searchParams;
  const city = locationIdSchema.safeParse(query.get("city"));
  const mode = query.get("mode") ?? "live";
  const validQuery = [...query.keys()].every((key) => key === "city" || key === "mode") &&
    query.getAll("city").length === 1 && query.getAll("mode").length <= 1;
  if (!validQuery || !city.success || (mode !== "live" && mode !== "demo")) {
    return Response.json({ error: { code: "invalid_air_query" } }, { status: 400, headers });
  }
  const snapshot = await getAir(city.data, mode);
  if (!builtInPlace(city.data) && !snapshot.location) {
    return Response.json({ error: { code: "location_unavailable" } }, { status: 404, headers });
  }
  return Response.json(snapshot, { headers });
}
