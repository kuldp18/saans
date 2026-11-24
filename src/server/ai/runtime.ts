import "server-only";
import { configuredOrigin, createHostedOperatorAccess, createLocalOperatorAccess } from "./access";
import { createLocalBudget, createSharedBudget, parseBudgetCaps } from "./budget";
import { createGeminiProvider, defaultGeminiModel } from "./gemini";
import { createAiRanker } from "./rank";

export function createOperatorRanker(env: NodeJS.ProcessEnv, { fetcher = fetch, now = Date.now } = {}) {
  const disabled = () => createAiRanker({ authorize: () => null });
  const origin = configuredOrigin(env.APP_ORIGIN);
  if (env.AI_ELIGIBILITY_VERIFIED !== "1" || !origin) return disabled();
  const mode = env.AI_MODE;
  const caps = parseBudgetCaps(env.AI_PROJECT_PER_MINUTE, env.AI_PROJECT_PER_DAY, env.AI_OPERATOR_PER_MINUTE);
  const provider = createGeminiProvider({
    apiKey: env.GEMINI_API_KEY ?? "", model: env.GEMINI_MODEL || defaultGeminiModel, fetcher,
  });
  if (mode === "operator-local" && env.NODE_ENV === "development") {
    const authorize = createLocalOperatorAccess(origin, env.AI_LOCAL_OPERATOR_TOKEN ?? "");
    return authorize ? createAiRanker({
      authorize, provider, reserve: caps ? createLocalBudget(caps, now) : undefined,
    }) : disabled();
  }
  if (mode === "operator-hosted" && env.NODE_ENV === "production") {
    const regions = new Set((env.AI_ALLOWED_REGIONS ?? "").split(","));
    if ([...regions].some((region) => !/^[A-Z]{2}$/.test(region))) return disabled();
    const authorize = createHostedOperatorAccess({ origin, regions, secret: env.AI_GATEWAY_SECRET ?? "", now });
    return authorize ? createAiRanker({
      authorize, provider,
      reserve: caps ? createSharedBudget({
        url: env.UPSTASH_REDIS_REST_URL ?? "", token: env.UPSTASH_REDIS_REST_TOKEN ?? "",
        namespace: env.AI_BUDGET_NAMESPACE ?? "", caps, fetcher,
      }) : undefined,
    }) : disabled();
  }
  return disabled();
}

export const rankOperatorPlan = createOperatorRanker(process.env);
