import "server-only";
import { readBoundedJson } from "../http/bounded-json";

export type BudgetCaps = { projectMinute: number; projectDay: number; operatorMinute: number };
const minute = 60_000;
const day = 86_400_000;

// All checks and increments are one operation. Redis TIME keeps UTC windows consistent across instances.
const reserveScript = `
local now = tonumber(redis.call('TIME')[1])
local widths = {60, 86400, 60}
local buckets = {}
local counts = {}
for i = 1, 3 do
  buckets[i] = math.floor(now / widths[i])
  local previous = redis.call('HMGET', KEYS[i], 'bucket', 'count')
  counts[i] = 0
  if tonumber(previous[1]) == buckets[i] then
    counts[i] = tonumber(previous[2])
  end
  if counts[i] >= tonumber(ARGV[i]) then return 0 end
end
for i = 1, 3 do
  redis.call('HSET', KEYS[i], 'bucket', buckets[i], 'count', counts[i] + 1)
  redis.call('EXPIRE', KEYS[i], widths[i] - now % widths[i])
end
return 1
`;

export function parseBudgetCaps(minuteCap: string | undefined, dayCap: string | undefined, operatorCap: string | undefined): BudgetCaps | null {
  const cap = (value: string | undefined) => value && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
  const projectMinute = cap(minuteCap);
  const projectDay = cap(dayCap);
  const operatorMinute = cap(operatorCap);
  return projectMinute !== null && projectDay !== null && operatorMinute !== null &&
    operatorMinute <= projectMinute && projectMinute <= projectDay
    ? { projectMinute, projectDay, operatorMinute } : null;
}

export function createLocalBudget(caps: BudgetCaps, now: () => number) {
  let minuteBucket = -1, minuteCount = 0, dayBucket = -1, dayCount = 0;
  return async (_operator: string, signal: AbortSignal) => {
    if (signal.aborted) return false;
    const time = now();
    const currentMinute = Math.floor(time / minute);
    const currentDay = Math.floor(time / day);
    if (currentMinute !== minuteBucket) { minuteBucket = currentMinute; minuteCount = 0; }
    if (currentDay !== dayBucket) { dayBucket = currentDay; dayCount = 0; }
    if (minuteCount >= Math.min(caps.projectMinute, caps.operatorMinute) || dayCount >= caps.projectDay) return false;
    minuteCount++;
    dayCount++;
    return true;
  };
}

export function createSharedBudget({ url, token, namespace, caps, fetcher }: {
  url: string; token: string; namespace: string; caps: BudgetCaps; fetcher: typeof fetch;
}) {
  let endpoint: URL;
  try { endpoint = new URL(url); } catch { return undefined; }
  if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.upstash\.io$/.test(endpoint.hostname) ||
    endpoint.pathname !== "/" || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    !token.trim() || !/^[a-z0-9-]{1,40}$/.test(namespace)) return undefined;
  const prefix = `saans:{${namespace}}`;
  return async (operator: string, signal: AbortSignal) => {
    if (!/^[a-f0-9]{64}$/.test(operator) || signal.aborted) return false;
    const command = ["EVAL", reserveScript, 3, `${prefix}:project:minute`, `${prefix}:project:day`,
      `${prefix}:operator:${operator}:minute`, caps.projectMinute, caps.projectDay, caps.operatorMinute];
    const response = await fetcher(endpoint, {
      method: "POST", signal, redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return false;
    }
    const reply = await readBoundedJson(response.body, 1024, signal);
    return typeof reply === "object" && reply !== null && "result" in reply &&
      reply.result === 1 && !("error" in reply);
  };
}
