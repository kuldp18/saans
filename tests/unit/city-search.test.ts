import { expect, it } from "vitest";
import { matchCity, nearestSupportedCity } from "../../src/domain/city-search";

it("matches supported city names, unique prefixes and common aliases", () => {
  expect(["new  delhi", " GURGAON ", "kolk", "Noi", "cat", "", "london"].map(matchCity))
    .toEqual(["delhi", "gurugram", "kolkata", "noida", undefined, undefined, undefined]);
});

it("chooses the nearest supported location and rejects distant or imprecise readings", () => {
  expect(nearestSupportedCity(26.8467, 80.9462, 30)).toBe("lucknow");
  expect(nearestSupportedCity(28.5355, 77.391, 40)).toBe("noida");
  expect(nearestSupportedCity(19.076, 72.8777, 40)).toBeUndefined();
  expect(nearestSupportedCity(28.6139, 77.209, 25_000)).toBeUndefined();
  expect(nearestSupportedCity(100, 77.209, 30)).toBeUndefined();
});
