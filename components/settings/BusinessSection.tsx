"use client";

import { useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useBusinessName } from "@/components/vault/useBusinessName";
import { saveBusinessName } from "@/lib/business/actions";
import { MAX_BUSINESS_NAME } from "@/lib/business/name";
import { LabelledInput, Notice, Section } from "./Section";

// The business Sleuthhound finds clients for. Its name appears across the
// app and in what the AI is told; it's kept in this browser with the rest.

export function BusinessSection() {
  const saved = useBusinessName();
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const value = draft ?? saved ?? "";
  const changed = draft !== null && draft.trim() !== (saved ?? "");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!changed) return;
    const res = await saveBusinessName(value);
    if (!res.ok) return setNotice({ text: res.message, error: true });
    setDraft(null);
    setNotice({ text: res.name ? "Saved" : "Cleared. Pages say “your clients” until a name is set.", error: false });
  }

  return (
    <Section id="business" title="Your business" lede="The name Sleuthhound uses for your business, on every page and in what it tells the AI." className="mt-32 max-md:mt-16">
      <form onSubmit={save} noValidate className="flex max-w-[360px] flex-col">
        <LabelledInput
          id="business-name"
          label="Business name"
          autoComplete="organization"
          maxLength={MAX_BUSINESS_NAME}
          placeholder="Not set"
          value={value}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice(null);
          }}
        />
        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={!changed} className={buttonClasses({ variant: "primary" })}>
            Save
          </button>
        </div>
        <Notice text={notice?.text ?? null} error={notice?.error} />
      </form>
    </Section>
  );
}
