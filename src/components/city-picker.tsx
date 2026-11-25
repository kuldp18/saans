"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cities, cityIdSchema, displayPlace, locationQuerySchema, placeSchema, type Place } from "@/catalog/cities";
import { matchCity, nearestSupportedCity } from "@/domain/city-search";
import { z } from "zod";

const searchResponse = z.object({ locations: z.array(placeSchema).max(12) });

export function CityPicker() {
  const [query, setQuery] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
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
          setLocationStatus("Couldn’t find a supported city near you. Search for a city.");
          return;
        }
        field.current?.setCustomValidity("");
        setQuery(cities[city].name);
        setLocationStatus(`Nearest supported city: ${cities[city].name}.`);
      },
      () => {
        if (request === revision.current) setLocationStatus("Location is unavailable. Search for a city.");
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
  const selectedId = selected && displayPlace(selected) === query ? selected.id : undefined;
  const city = selectedId ?? matchCity(query);
  const shouldSearch = !!searchTerm && !selectedId && !locationStatus.startsWith("Nearest supported city:");
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
            const text = event.target.value;
            const place = results?.find((item) => displayPlace(item) === text);
            setSelected(place);
            setQuery(text);
            setLocationStatus("");
          }}
        />
        <input type="hidden" name="city" value={city ?? ""} />
        <datalist id="supported-cities">
          {cityIdSchema.options.map((id) => <option key={id} value={cities[id].name} />)}
        </datalist>
        <p id="city-search-help" className="mb-0 text-sm font-normal text-muted">
          Enter a city name, then choose a match by region and country.
        </p>
        {shouldSearch && !selectedId && results && results.length > 0 && (
          <ul aria-label="City search results" className="my-2 grid list-none gap-2 p-0">
            {results.map((place) => (
              <li key={place.id}><button type="button" className="action action-secondary" onClick={() => {
                setSelected(place);
                setQuery(displayPlace(place));
                field.current?.focus();
              }}>{displayPlace(place)}</button></li>
            ))}
          </ul>
        )}
        <p role="status" className="mb-0 text-sm text-muted">{selectedId ? `Selected ${query}.` : shouldSearch
          ? results === null ? city ? "" : "Worldwide search is unavailable. Try again or open the Delhi sample."
            : results ? results.length ? `${results.length} city matches.` : city ? "" : "No matching cities."
              : city ? "" : "Searching for cities."
          : ""}</p>
      </div>
      <button type="button" className="action action-secondary mt-3" onClick={() => {
        if (navigator.geolocation) {
          setLocationStatus("Finding your nearest supported city.");
          locate();
        } else setLocationStatus("Location is unavailable. Search for a city.");
      }}>Use my location</button>
      <p role="status" className="mb-0 mt-1 text-sm text-muted">{locationStatus}</p>
    </>
  );
}
