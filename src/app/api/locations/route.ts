import { locationQuerySchema } from "@/catalog/cities";
import { searchLocations } from "@/server/air/runtime";
import { createRequestGate } from "@/server/http/rate-limit";

export const runtime = "nodejs";
const gate = createRequestGate(120);
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const retry = gate();
  if (retry) return Response.json({ error: { code: "rate_limited" } }, {
    status: 429, headers: { ...headers, "Retry-After": String(retry) },
  });
  const params = new URL(request.url).searchParams;
  const query = locationQuerySchema.safeParse(params.get("q"));
  if (!query.success || [...params.keys()].length !== 1) {
    return Response.json({ error: { code: "invalid_location_query" } }, { status: 400, headers });
  }
  const locations = await searchLocations(query.data);
  if (!locations) return Response.json({ error: { code: "search_unavailable" } }, { status: 503, headers });
  return Response.json({ locations }, { headers });
}
