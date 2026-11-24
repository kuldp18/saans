import { z } from "zod";

export const cityIdSchema = z.enum([
  "delhi", "noida", "gurugram", "lucknow", "ahmedabad", "kolkata",
]);
export type CityId = z.infer<typeof cityIdSchema>;

const indiaTimeZone = "Asia/Kolkata";

export const cities = {
  delhi: { name: "Delhi", latitude: 28.6139, longitude: 77.209, timeZone: indiaTimeZone },
  noida: { name: "Noida", latitude: 28.5355, longitude: 77.391, timeZone: indiaTimeZone },
  gurugram: { name: "Gurugram", latitude: 28.4595, longitude: 77.0266, timeZone: indiaTimeZone },
  lucknow: { name: "Lucknow", latitude: 26.8467, longitude: 80.9462, timeZone: indiaTimeZone },
  ahmedabad: { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714, timeZone: indiaTimeZone },
  kolkata: { name: "Kolkata", latitude: 22.5726, longitude: 88.3639, timeZone: indiaTimeZone },
} as const satisfies Record<CityId, { name: string; latitude: number; longitude: number; timeZone: string }>;
