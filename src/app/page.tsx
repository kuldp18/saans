import Link from "next/link";
import { cities, cityIdSchema } from "@/catalog/cities";
import { AirContext } from "@/components/air-context";
import { SelectField } from "@/components/ui";

const cityOptions = [
  { value: "", label: "Select a city" },
  ...cityIdSchema.options.map((city) => ({ value: city, label: cities[city].name })),
];

export default function TodayPage() {
  return (
    <form action="/plan" method="get" className="today-grid">
      <div className="today-intro">
        <h1>Make a plan for today’s air.</h1>
        <p>Choose your city and map out what you can change in your routine, at home and on the road.</p>
        <SelectField label="City" name="city" required options={cityOptions} defaultValue="" />
      </div>
      <aside className="today-air" aria-label="Air context"><AirContext /></aside>
      <div className="today-actions flex flex-wrap items-center gap-3">
        <button className="action" type="submit">Build my plan</button>
        <Link className="action action-secondary" href="/plan?city=delhi&mode=demo">Try Delhi demo</Link>
      </div>
    </form>
  );
}
