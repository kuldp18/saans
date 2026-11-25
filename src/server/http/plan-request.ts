import { z } from "zod";
import { locationIdSchema } from "../../catalog/cities";
import { parsePlanInput } from "../../domain/plan/input";
import { BodyTooLarge, readBoundedJson } from "./bounded-json";

const BODY_LIMIT = 4096;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const envelope = z.strictObject({
  city: locationIdSchema,
  mode: z.enum(["demo", "live"]),
  profile: z.unknown(),
});

export function allowsPlanOrigin(request: Request, configured: string | undefined) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const local = new URL(origin);
    const expected = configured ? new URL(configured) : null;
    if (expected && !["http:", "https:"].includes(expected.protocol)) return false;
    if (expected && (expected.protocol !== "http:" || !loopbackHosts.has(expected.hostname))) {
      return expected.origin === origin;
    }
    // Next may reconstruct request.url from the server bind address.
    return local.protocol === "http:" && loopbackHosts.has(local.hostname)
      && origin === local.origin && local.host === request.headers.get("host")
      && (!expected || (expected.origin === configured && expected.port === local.port));
  } catch {
    return false;
  }
}

function rejected(status: number, code: string) {
  return { ok: false, status, error: { code } } as const;
}

export async function readPlanRequest(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return rejected(415, "json_required");
  }
  if (Number(request.headers.get("content-length")) > BODY_LIMIT) return rejected(413, "body_too_large");
  let payload: unknown;
  try {
    payload = await readBoundedJson(request.body, BODY_LIMIT, request.signal);
  } catch (error) {
    if (error instanceof BodyTooLarge) return rejected(413, "body_too_large");
    return rejected(400, "invalid_json");
  }

  const input = envelope.safeParse(payload);
  if (!input.success) return rejected(400, "invalid_plan");
  const { profile, city, mode } = input.data;
  if (mode === "demo" && city !== "delhi") return rejected(400, "invalid_plan");
  const parsed = parsePlanInput(profile);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(({ path, code }) => ({
      pointer: "/profile" + path.map((part) => `/${String(part).replaceAll("~", "~0").replaceAll("/", "~1")}`).join(""),
      code,
    }));
    return { ...rejected(400, "invalid_profile"), error: { code: "invalid_profile", issues } };
  }
  return { ok: true, city, mode, profile: parsed.data } as const;
}
