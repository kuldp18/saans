import { cities, cityIdSchema, type CityId } from "../catalog/cities";

const names = cityIdSchema.options.map((id) => [cities[id].name.toLowerCase(), id] as const);
const aliases = new Map<string, CityId>([
  ["new delhi", "delhi"], ["gurgaon", "gurugram"], ["calcutta", "kolkata"], ["ahmadabad", "ahmedabad"],
]);

export function matchCity(text: string): CityId | undefined {
  const query = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!query) return undefined;
  const exact = names.find(([name]) => name === query)?.[1] ?? aliases.get(query);
  if (exact) return exact;
  const matches = names.filter(([name]) => name.startsWith(query));
  return matches.length === 1 ? matches[0]?.[1] : undefined;
}

const radians = Math.PI / 180;

export function nearestSupportedCity(latitude: number, longitude: number, accuracy: number): CityId | undefined {
  if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 || accuracy < 0 || accuracy > 20_000) return undefined;
  let closest: CityId | undefined;
  let distanceKm = 35;
  for (const id of cityIdSchema.options) {
    const city = cities[id];
    const latitudePart = Math.sin((city.latitude - latitude) * radians / 2) ** 2;
    const longitudePart = Math.sin((city.longitude - longitude) * radians / 2) ** 2;
    const distance = 12_742 * Math.asin(Math.min(1, Math.sqrt(
      latitudePart + Math.cos(latitude * radians) * Math.cos(city.latitude * radians) * longitudePart,
    )));
    if (distance < distanceKm) {
      closest = id;
      distanceKm = distance;
    }
  }
  return closest;
}
