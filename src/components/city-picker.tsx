"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cities, cityIdSchema, displayPlace, locationQuerySchema, placeSchema, type CityId, type Place } from "@/catalog/cities";
import { matchCity, nearestSupportedCity } from "@/domain/city-search";
import { z } from "zod";

const searchResponse = z.object({ locations: z.array(placeSchema).max(12) });
type DeviceLocation =
  | { status: "idle" | "locating" | "unavailable" | "no-match" }
  | { status: "found"; city: CityId };

function describeLocation(location: DeviceLocation) {
  switch (location.status) {
    case "found": return `Nearest supported city: ${cities[location.city].name}.`;
    case "locating": return "Finding your nearest supported city.";
    case "unavailable": return "Location is unavailable. Search for a city.";
    case "no-match": return "Couldn’t find a supported city near you. Search for a city.";
    case "idle": return "";
  }
}

function describeSearch(results: Place[] | null | undefined, hasCity: boolean) {
  if (results?.length) return `${results.length} city matches.`;
  if (hasCity) return "";
  if (results === null) return "Worldwide search is unavailable. Try again or open the Delhi sample.";
  return results ? "No matching cities." : "Searching for cities.";
}

export function CityPicker() {
  const [query, setQuery] = useState("");
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation>({ status: "idle" });
  const [search, setSearch] = useState<{ query: string; results: Place[] | null; }>();
  const [selected, setSelected] = useState<Place>();
  const field = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const invalidateLocation = useCallback(() => { revision.current++; }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    const request = ++revision.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== revision.current) return;
        const city = nearestSupportedCity(coords.latitude, coords.longitude, coords.accuracy);
        if (!city) {
          setDeviceLocation({ status: "no-match" });
          return;
        }
        field.current?.setCustomValidity("");
        setSelected(undefined);
        setQuery(cities[city].name);
        setDeviceLocation({ status: "found", city });
      },
      () => {
        if (request === revision.current) setDeviceLocation({ status: "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 5_000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    locate();
    return invalidateLocation;
  }, [invalidateLocation, locate]);

  const liveQuery = locationQuerySchema.safeParse(query);
  const searchTerm = liveQuery.success ? liveQuery.data : "";
  const results = search?.query === searchTerm ? search.results : undefined;
  const city = selected?.id ?? matchCity(query);
  const shouldSearch = !!searchTerm && !selected && deviceLocation.status !== "found";
  const searchStatus = selected ? `Selected ${query}.` : shouldSearch ? describeSearch(results, !!city) : "";
  useEffect(() => {
    if (!shouldSearch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations?${new URLSearchParams({ q: searchTerm })}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6_000)]),
        });
        const parsed = response.ok ? searchResponse.safeParse(await response.json()) : null;
        if (!controller.signal.aborted) setSearch({ query: searchTerm, results: parsed?.success ? parsed.data.locations : null });
      } catch {
        if (!controller.signal.aborted) setSearch({ query: searchTerm, results: null });
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchTerm, shouldSearch]);

  useEffect(() => {
    field.current?.setCustomValidity(query && !city ? "Choose a city from the search results." : "");
  }, [query, city]);

  return (
    <>
      <div className="field">
        <label htmlFor="city-search">City</label>
        <input ref={field} id="city-search" type="search" required list="supported-cities"
          aria-describedby="city-search-help" autoComplete="off" maxLength={210} placeholder="Search cities worldwide"
          value={query}
          onChange={(event) => {
            invalidateLocation();
            setSelected(undefined);
            setQuery(event.target.value);
            setDeviceLocation({ status: "idle" });
          }}
        />
        <input type="hidden" name="city" value={city ?? ""} />
        <datalist id="supported-cities">
          {cityIdSchema.options.map((id) => <option key={id} value={cities[id].name} />)}
        </datalist>
        <p id="city-search-help" className="mb-0 text-sm font-normal text-muted">
          Enter a city name, then choose a match by region and country.
        </p>
        {shouldSearch && !!results?.length && (
          <ul aria-label="City search results" className="my-2 grid list-none gap-2 p-0">
            {results.map((place) => (
              <li key={place.id}><button type="button" className="action action-secondary" onClick={() => {
                invalidateLocation();
                setSelected(place);
                setQuery(displayPlace(place));
                setDeviceLocation({ status: "idle" });
                field.current?.focus();
              }}>{displayPlace(place)}</button></li>
            ))}
          </ul>
        )}
        <p role="status" className="mb-0 text-sm text-muted">{searchStatus}</p>
      </div>
      <button type="button" className="action action-secondary mt-3" onClick={() => {
        if (navigator.geolocation) {
          setDeviceLocation({ status: "locating" });
          locate();
        } else setDeviceLocation({ status: "unavailable" });
      }}>Use my location</button>
      <p role="status" className="mb-0 mt-1 text-sm text-muted">{describeLocation(deviceLocation)}</p>
    </>
  );
}
