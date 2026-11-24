import type { ActionId } from "./actions";

export const alternateReasons: Partial<Record<ActionId, string>> = {
  "shift-flexible-activity": "The routine allows a timing change, and the forecast supports a lower-particle option of the same duration.",
  "move-activity-indoors": "The routine includes an indoor venue for this optional activity.",
  "pause-outdoor-activity": "Available conditions do not support a recommendation for optional outdoor exertion.",
  "skip-incense-and-candles": "Avoiding an indoor smoke source is possible without buying equipment.",
  "use-particle-filter": "This option uses equipment that is already available.",
  "consider-particle-filter": "This option fits a budget open to purchases and an interest in filtration.",
  "combine-car-trips": "The proposed combined journey reduces the confirmed private-car distance.",
  "replace-car-trip": "The confirmed alternative requires less private-car travel.",
};
