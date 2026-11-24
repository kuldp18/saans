import type { ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="surface">{children}</div>;
}

export function Status({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "sample";
}) {
  return <p className={`status status-${tone}`}>{children}</p>;
}

export function SelectField({ label, options, id, name, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const fieldId = id ?? name;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <select id={fieldId} name={name} {...props}>
        {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );
}
