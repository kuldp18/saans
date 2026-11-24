import type { SourceId } from "./sources";
import type { PlanInput } from "../domain/plan/input";

type Eligibility = {
  input: PlanInput;
  advisory: boolean;
  canMove: boolean;
  canGoIndoors: boolean;
  pause: boolean;
  hasTravelSavings: boolean;
};

type Action = {
  type: "advisory" | "routine" | "indoor" | "travel";
  cost: "no-purchase" | "existing-equipment" | "purchase";
  sourceId: SourceId;
  title: string;
  rationale: string;
  mechanism: string;
  caveat: string;
  eligible: (context: Eligibility) => boolean;
};

export const actions = {
  "check-local-advisory": {
    type: "advisory", cost: "no-purchase", sourceId: "CPCB-INDIA",
    title: "Check the local air advisory",
    rationale: "The modeled US AQI reaches very unhealthy or hazardous levels.",
    mechanism: "Use the current official advisory to make activity decisions.",
    caveat: "CPCB readings use India’s AQI scale.",
    eligible: ({ advisory }) => advisory,
  },
  "shift-flexible-activity": {
    type: "routine", cost: "no-purchase", sourceId: "OPEN-METEO-AIR",
    title: "Move the activity to a lower-PM₂.₅ window",
    rationale: "A same-duration window fits the schedule and has lower modeled outdoor PM₂.₅.",
    mechanism: "Compare duration-weighted outdoor concentration across the two windows.",
    caveat: "The model describes outdoor air across a grid area. Personal exposure can differ.",
    eligible: ({ canMove }) => canMove,
  },
  "move-activity-indoors": {
    type: "routine", cost: "no-purchase", sourceId: "AIRNOW-ACTIVITY",
    title: "Move the activity indoors",
    rationale: "An indoor venue is available for this optional activity.",
    mechanism: "Keep the scheduled time and use the indoor venue.",
    caveat: "Indoor air quality varies by venue. Follow the local advisory.",
    eligible: ({ canGoIndoors }) => canGoIndoors,
  },
  "pause-outdoor-activity": {
    type: "routine", cost: "no-purchase", sourceId: "AIRNOW-ACTIVITY",
    title: "Pause optional outdoor exertion",
    rationale: "The plan cannot confirm an outdoor window that meets its activity rules.",
    mechanism: "Defer optional outdoor exertion and check the local advisory.",
    caveat: "Check current guidance before rescheduling.",
    eligible: ({ pause }) => pause,
  },
  "keep-commitment": {
    type: "routine", cost: "no-purchase", sourceId: "CPCB-INDIA",
    title: "Keep the commitment",
    rationale: "The schedule is fixed or no lower-PM₂.₅ window has been established.",
    mechanism: "Retain the existing commitment and follow current local guidance.",
    caveat: "Conditions may still warrant adjustments under the local advisory.",
    eligible: ({ canMove, canGoIndoors, pause }) => !canMove && !canGoIndoors && !pause,
  },
  "skip-incense-and-candles": {
    type: "indoor", cost: "no-purchase", sourceId: "EPA-HOME",
    title: "Skip incense and candles",
    rationale: "Source control is a no-purchase option where incense or candles are used.",
    mechanism: "Skipping incense and candles avoids adding smoke particles indoors.",
    caveat: "Saans has no indoor particle measurement or quantified reduction.",
    eligible: () => true,
  },
  "use-particle-filter": {
    type: "indoor", cost: "existing-equipment", sourceId: "EPA-HOME",
    title: "Use the available particle filter",
    rationale: "A suitable particle filter is already available.",
    mechanism: "A suitable filter can capture airborne particles in the room it serves.",
    caveat: "A particle filter does not remove all pollutants.",
    eligible: ({ input }) => input.suitableFilter === "available",
  },
  "consider-particle-filter": {
    type: "indoor", cost: "purchase", sourceId: "EPA-HOME",
    title: "Consider suitable particle filtration",
    rationale: "The household is considering a filter and has a purchase budget.",
    mechanism: "A suitable filter can capture airborne particles in the room it serves.",
    caveat: "Performance depends on the room, device and use.",
    eligible: ({ input }) => input.suitableFilter === "considering" && input.budget === "open",
  },
  "combine-car-trips": {
    type: "travel", cost: "no-purchase", sourceId: "EPA-TRAVEL",
    title: "Combine the car trips",
    rationale: "A feasible combined journey covers fewer private-car vehicle-kilometers.",
    mechanism: "Avoiding combustion-engine travel can reduce tailpipe pollution.",
    caveat: "The estimate covers vehicle distance. Air quality and emissions are not calculated.",
    eligible: ({ input, hasTravelSavings }) => hasTravelSavings && input.travel?.kind === "consolidate",
  },
  "replace-car-trip": {
    type: "travel", cost: "no-purchase", sourceId: "EPA-TRAVEL",
    title: "Use the feasible travel alternative",
    rationale: "The replacement covers fewer private-car vehicle-kilometers.",
    mechanism: "Avoiding combustion-engine travel can reduce tailpipe pollution.",
    caveat: "The estimate covers vehicle distance. Air quality and emissions are not calculated.",
    eligible: ({ input, hasTravelSavings }) => hasTravelSavings && input.travel?.kind === "replace",
  },
} satisfies Record<string, Action>;

export type ActionId = keyof typeof actions;
