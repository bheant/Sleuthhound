"use client";

import { useState, type ReactNode } from "react";

// The wizard's form controls, as in the design: chips, segmented toggles, a
// square switch and a select, all square-cornered with 1px borders.

export const fieldClass =
  "h-11 w-full rounded-none border border-rule bg-transparent px-3.5 font-sans text-[15px] text-ink outline-none focus:border-focus focus:shadow-[0_0_0_1px_var(--focus)] disabled:opacity-60";

export function Suggested() {
  return <span className="text-[12px] leading-4 text-data">suggested</span>;
}

export function FieldLabel({ htmlFor, children, suggested }: { htmlFor?: string; children: ReactNode; suggested?: boolean }) {
  return (
    <p className="m-0 mb-2 flex items-baseline gap-2.5 text-[14px] leading-5 text-ink-secondary">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
      {suggested ? <Suggested /> : null}
    </p>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-2 mb-0 text-[14px] leading-5 text-error-ink">
      {children}
    </p>
  );
}

const crossIcon = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

type ChipsProps = {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  label: string;
  /** How a value shows in its chip, such as a SIC code with its name. */
  display?: (value: string) => string;
  /** Turns typed text into a value; null refuses it. */
  accept?: (text: string) => string | null;
  wrap?: boolean;
  suggestions?: Array<{ value: string; label: string }>;
};

// Values as square chips with ×; Enter or a comma adds what's typed.
export function ChipsInput({ values, onChange, placeholder, label, display = (v) => v, accept = (t) => t, wrap, suggestions }: ChipsProps) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState(false);
  const matches =
    suggestions && draft.trim().length > 1
      ? suggestions.filter((s) => !values.includes(s.value) && s.label.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 6)
      : [];

  function add(text: string) {
    const value = accept(text.trim());
    if (!text.trim()) return;
    if (!value) {
      setRefused(true);
      return;
    }
    if (!values.includes(value)) onChange([...values, value]);
    setDraft("");
    setRefused(false);
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 border border-rule p-[5px] focus-within:border-focus">
        {values.map((v) => (
          <span
            key={v}
            className={`inline-flex items-center gap-1.5 border border-strong pr-1 pl-2.5 text-[14px] text-ink ${wrap ? "min-h-8 py-1" : "h-8 whitespace-nowrap"}`}
          >
            {display(v)}
            <button
              type="button"
              aria-label={`Remove ${display(v)}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="flex size-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-ink-muted hover:text-ink"
            >
              {crossIcon}
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setRefused(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(matches[0] && !accept(draft.trim()) ? matches[0].value : draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim() && accept(draft.trim())) add(draft);
          }}
          className="h-8 min-w-[140px] flex-[1_1_140px] border border-transparent bg-transparent px-2 font-sans text-[14px] text-ink outline-none"
        />
      </div>
      {matches.length > 0 ? (
        <ul className="absolute inset-x-0 top-full z-10 m-0 list-none border border-strong border-t-0 bg-field p-0">
          {matches.map((m) => (
            <li key={m.value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(m.value)}
                className="w-full cursor-pointer border-0 bg-transparent px-3 py-2 text-left font-sans text-[14px] text-ink hover:bg-row-selected"
              >
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {refused ? <FieldError>That doesn’t look right. Check it and press Enter.</FieldError> : null}
    </div>
  );
}

type SegmentedProps = {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

export function Segmented({ label, value, options, onChange }: SegmentedProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex h-10 min-w-[88px] items-center justify-center gap-2 border px-3.5 font-sans text-[14px] leading-5 transition-colors duration-150 ${
              i > 0 ? "-ml-px" : ""
            } ${on ? "relative z-[1] cursor-default border-primary-edge bg-primary text-ink" : "cursor-pointer border-rule bg-transparent text-ink-secondary hover:border-control hover:text-ink"}`}
          >
            <span aria-hidden className={`size-1.5 border ${on ? "border-data bg-data" : "border-control"}`} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none cursor-pointer border p-0 transition-colors duration-150 ${checked ? "border-primary-edge bg-primary" : "border-strong bg-transparent"}`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] left-[3px] size-4 transition-transform duration-150 ease-out ${checked ? "translate-x-5 bg-ink" : "bg-ink-muted"}`}
      />
    </button>
  );
}

type SelectProps = {
  id?: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
};

export function Select({ id, label, value, options, onChange, className = "" }: SelectProps) {
  return (
    <span className={`relative block ${className}`}>
      <select
        id={id}
        aria-label={id ? undefined : label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none rounded-none border border-rule bg-canvas pr-[34px] pl-3 font-sans text-[14px] text-ink outline-none focus:border-focus"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="pointer-events-none absolute top-1/2 right-3 -mt-[5px] text-ink-secondary">
        <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

export function StepHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-1.5 mb-0 text-[22px] leading-[30px] font-normal">{children}</h3>;
}

export function StepLede({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 mb-0 text-[14px] leading-5 text-ink-secondary">{children}</p>;
}
