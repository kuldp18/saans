import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const assertionSchema = z.strictObject({
  aud: z.string(),
  sub: z.string().regex(/^[A-Za-z0-9._:@-]{1,128}$/),
  adult: z.literal(true),
  region: z.string().regex(/^[A-Z]{2}$/),
  iat: z.int().nonnegative(),
  exp: z.int().positive(),
});

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function configuredOrigin(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "");
    return url.origin === value && ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function createLocalOperatorAccess(origin: URL, token: string) {
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    token.length < 32 || token.length > 256) return undefined;
  return (request: Request) => request.headers.get("host") === origin.host &&
    request.headers.get("origin") === origin.origin &&
    equal(request.headers.get("authorization") ?? "", `Bearer ${token}`) ? "local-operator" : null;
}

export function createHostedOperatorAccess({
  origin, secret, regions, now,
}: {
  origin: URL; secret: string; regions: ReadonlySet<string>; now: () => number;
}) {
  if (origin.protocol !== "https:" || secret.length < 32 || regions.size === 0) return undefined;
  return (request: Request) => {
    if (request.headers.get("origin") !== origin.origin) return null;
    const header = request.headers.get("x-saans-operator-assertion") ?? "";
    if (header.length > 1024 || !/^[\w-]+\.[\w-]{43}$/.test(header)) return null;
    const [payload, mac] = header.split(".");
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    if (!equal(mac, expected)) return null;
    try {
      const claims = assertionSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
      if (!claims.success) return null;
      const { aud, sub, region, iat, exp } = claims.data;
      const time = Math.floor(now() / 1000);
      if (aud !== origin.origin || !regions.has(region) || iat > time + 5 ||
        exp <= time || exp <= iat || exp - iat > 60) return null;
      return createHmac("sha256", secret).update("saans-operator-quota:").update(sub).digest("hex");
    } catch {
      return null;
    }
  };
}
