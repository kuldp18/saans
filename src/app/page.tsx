import Link from "next/link";
import { AirContext } from "@/components/air-context";
import { CityPicker } from "@/components/city-picker";

export default function TodayPage() {
  return (
    <form action="/plan" method="get" className="today-grid">
      <div className="today-intro">
        <h1>Make a plan for today’s air.</h1>
        <p>Choose your city and map out what you can change in your routine, at home and on the road.</p>
        <CityPicker />
      </div>
      <aside className="today-air" aria-label="Air context"><AirContext /></aside>
      <div className="today-actions flex flex-wrap items-center gap-3">
        <button className="action" type="submit">Build my plan</button>
        <Link className="action action-secondary" href="/plan?city=delhi&mode=demo">Try Delhi demo</Link>
      </div>
    </form>
  );
}
