import type { ReactNode } from "react";

type Props = { id: string; title: string; lede?: string; children: ReactNode; className?: string };

// A Settings section: a rule, the heading (and lede) on the left, the content on the right.
export function Section({ id, title, lede, children, className = "" }: Props) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`sh-in mx-gutter flex scroll-mt-10 flex-wrap gap-x-12 gap-y-6 border-t border-rule pt-6 ${className}`}>
      <div className="flex-[0_1_280px]">
        <h2 id={`${id}-h`} className="m-0 text-[32px] leading-10 font-light tracking-[-0.01em]">
          {title}
        </h2>
        {lede ? <p className="mt-3 mb-0 text-ink-secondary">{lede}</p> : null}
      </div>
      <div className="min-w-0 flex-[999_1_640px]">{children}</div>
    </section>
  );
}

export const inputClass =
  "h-11 min-w-0 rounded-none border border-rule bg-transparent px-3.5 font-sans text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-focus focus:shadow-[0_0_0_1px_var(--focus)] aria-invalid:border-error";

export const labelClass = "text-[14px] leading-5 text-ink-secondary";

export function Notice({ text, error = false }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return (
    <p role={error ? "alert" : "status"} className={`mt-3 mb-0 text-[14px] leading-5 ${error ? "text-error-ink" : "text-ink-secondary"}`}>
      {text}
    </p>
  );
}

/** A field with its label above, as the Settings forms use. */
export function LabelledInput({ id, label, ...input }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <>
      <label htmlFor={id} className={`${labelClass} mt-5 first:mt-0`}>
        {label}
      </label>
      <input id={id} className={`${inputClass} mt-2`} {...input} />
    </>
  );
}
