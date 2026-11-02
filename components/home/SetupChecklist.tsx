"use client";

import Link from "next/link";
import { hideChecklist, type Checklist } from "@/lib/home/checklist";

// Three steps for a new account, each linking to where it's done. A done
// step keeps its place, ticked, so the list doesn't jump.

const STEPS = {
  business: { label: "Set your business name", href: "/settings#business", action: "Set it" },
  key: { label: "Add an API key", href: "/settings#keys", action: "Add one" },
  source: { label: "Add your first source", href: "/connections", action: "Add one" },
} as const;

const quiet = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] leading-5 text-ink-secondary hover:text-ink";

export function SetupChecklist({ checklist }: { checklist: Checklist }) {
  const done = checklist.items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="setup-h" className="sh-in sh-d1 mt-16 max-w-[560px] border border-subtle px-5 py-5 max-md:mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="setup-h" className="m-0 text-[15px] leading-[22px] font-normal">
          Get set up <span className="text-ink-secondary tabular-nums">{done} of 3 done</span>
        </h2>
        <button type="button" onClick={() => void hideChecklist()} className={quiet}>
          Hide
        </button>
      </div>
      <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
        {checklist.items.map((item) => {
          const step = STEPS[item.key];
          return (
            <li key={item.key} className="flex items-center justify-between gap-4 text-[15px] leading-[22px]">
              <span className={`flex items-center gap-3 ${item.done ? "text-ink-secondary" : ""}`}>
                <span aria-hidden className={`flex size-4 flex-none items-center justify-center border ${item.done ? "border-data bg-data" : "border-strong"}`}>
                  {item.done ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5.2 4 7.5l4.5-5" stroke="black" strokeWidth="1.6" />
                    </svg>
                  ) : null}
                </span>
                {step.label}
                <span className="sr-only">{item.done ? ", done" : ", not done yet"}</span>
              </span>
              {item.done ? null : (
                <Link href={step.href} className={`${quiet} no-underline shrink-0`}>
                  {step.action}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
