"use client";

import type { ScopeFieldSpec } from "@/lib/connectors/types";
import { ChipsInput, FieldError, FieldLabel, fieldClass, Segmented, Select, Suggested, Switch } from "./fields";

// The Scope step's form, built from the connector's scopeFields. Each value
// the AI filled in carries "suggested" until it's changed. Fields that share
// a row sit side by side.

type Props = {
  fields: ScopeFieldSpec[];
  scope: Record<string, unknown>;
  suggested: ReadonlySet<string>;
  issues: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
};

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function sicAccept(options: ScopeFieldSpec["options"]) {
  return (text: string): string | null => {
    const code = text.match(/^\d{5}/)?.[0];
    if (code) return code;
    const hit = options?.find((o) => o.label.toLowerCase().includes(text.toLowerCase()));
    return hit ? hit.value : null;
  };
}

// Subreddits are written r/name.
function subredditAccept(text: string): string | null {
  const name = text.replace(/^\/?r\//i, "").trim();
  return /^[A-Za-z0-9_]{2,21}$/.test(name) ? `r/${name}` : null;
}

function Field({ field, value, suggested, issue, onChange }: {
  field: ScopeFieldSpec;
  value: unknown;
  suggested: boolean;
  issue?: string;
  onChange: (value: unknown) => void;
}) {
  const id = `scope-${field.key}`;
  switch (field.input) {
    case "toggle":
      return (
        <div>
          <div className="flex items-center gap-3.5">
            <Switch checked={Boolean(value)} onChange={onChange} labelledBy={`${id}-l`} />
            <span id={`${id}-l`} className="text-[15px]">
              {field.label}
            </span>
            {field.help ? <span className="text-[14px] text-ink-secondary">{field.help}</span> : null}
            {suggested ? <span className="ml-auto"><Suggested /></span> : null}
          </div>
          {issue ? <FieldError>{issue}</FieldError> : null}
        </div>
      );
    case "checkboxes":
      return (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 flex items-baseline gap-2.5 p-0 text-[14px] leading-5 text-ink-secondary">
            {field.label}
            {suggested ? <Suggested /> : null}
          </legend>
          {field.options?.map((o) => {
            const values = asArray(value);
            const on = values.includes(o.value);
            return (
              <label key={o.value} className="flex min-h-9 cursor-pointer items-center gap-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(on ? values.filter((x) => x !== o.value) : [...values, o.value])}
                  className="m-0 size-4 accent-primary-edge"
                />
                {o.label}
              </label>
            );
          })}
          {issue ? <FieldError>{issue}</FieldError> : null}
        </fieldset>
      );
    default:
      return (
        <div>
          <FieldLabel htmlFor={["text", "date", "number", "select"].includes(field.input) ? id : undefined} suggested={suggested}>
            {field.label}
          </FieldLabel>
          {control(field, id, value, onChange)}
          {field.help && field.input !== "number" ? <p className="mt-2 mb-0 text-[13px] leading-[18px] text-ink-muted">{field.help}</p> : null}
          {issue ? <FieldError>{issue}</FieldError> : null}
        </div>
      );
  }
}

function control(field: ScopeFieldSpec, id: string, value: unknown, onChange: (value: unknown) => void) {
  switch (field.input) {
    case "text":
      return <input id={id} className={fieldClass} value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input id={id} type="date" className={`${fieldClass} [color-scheme:dark]`} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input
          id={id}
          inputMode="numeric"
          className={fieldClass.replace("w-full", "w-24")}
          value={String(value ?? "")}
          title={field.help}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d]/g, ""));
            onChange(Number.isFinite(n) ? n : 0);
          }}
        />
      );
    case "select":
      return <Select id={id} label={field.label} value={String(value ?? "")} options={field.options ?? []} onChange={onChange} className="max-w-[280px]" />;
    case "segmented":
      return <Segmented label={field.label} value={String(value ?? "")} options={field.options ?? []} onChange={onChange} />;
    case "sic": {
      const names = new Map((field.options ?? []).map((o) => [o.value, o.label.replace(/^\d{5}\s*/, "")]));
      return (
        <ChipsInput
          label={`Add to ${field.label.toLowerCase()}`}
          placeholder={field.placeholder ?? "Add a code"}
          values={asArray(value)}
          onChange={onChange}
          display={(code) => (names.get(code) ? `${code}, ${names.get(code)}` : code)}
          accept={sicAccept(field.options)}
          suggestions={field.options}
          wrap
        />
      );
    }
    case "chips":
      return (
        <ChipsInput
          label={`Add to ${field.label.toLowerCase()}`}
          placeholder={field.placeholder ?? "Add one"}
          values={asArray(value)}
          onChange={onChange}
          accept={field.key === "subreddits" ? subredditAccept : undefined}
        />
      );
    default:
      return null;
  }
}

export function ScopeForm({ fields, scope, suggested, issues, onChange }: Props) {
  // Group consecutive fields that share a row.
  const rows: ScopeFieldSpec[][] = [];
  for (const f of fields) {
    const last = rows[rows.length - 1];
    if (f.row && last?.[0]?.row === f.row) last.push(f);
    else rows.push([f]);
  }
  return (
    <div className="mt-6 flex flex-col gap-5">
      {rows.map((row) => (
        <div key={row[0].key} className={row.length > 1 ? "flex flex-wrap gap-x-8 gap-y-5" : ""}>
          {row.map((f) => (
            <div key={f.key} className={row.length > 1 && (f.input === "text" || f.input === "date") ? "min-w-0 flex-[1_1_180px]" : ""}>
              <Field field={f} value={scope[f.key]} suggested={suggested.has(f.key)} issue={issues[f.key]} onChange={(v) => onChange(f.key, v)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
