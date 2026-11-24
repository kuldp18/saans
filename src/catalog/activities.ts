import type { Activity } from "../domain/plan/input";

export const activityNames = {
  "school-pickup": "School pickup",
  errand: "Errand",
  "outdoor-group-activity": "Outdoor group activity",
} satisfies Record<Activity["activityId"], string>;
