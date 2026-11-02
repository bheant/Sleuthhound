import type { ReactNode } from "react";
import { Crosshair } from "@/components/ui/Crosshair";

// The vault and sign-in screens share one centred 280px column on black. On phone the
// column fills the width inside 24px margins, with 44px fields and 16px text.

export const field =
  "box-border h-9 rounded-login border bg-field px-3 font-sans text-[14px] text-ink outline-none transition-[border-color,box-shadow] duration-100 focus:border-focus focus:shadow-[0_0_0_1px_var(--focus)] disabled:opacity-100 max-md:h-11 max-md:px-3.5 max-md:text-[16px]";
export const errorText = "mt-2 mb-0 text-[13px] leading-[18px] text-error-ink";
export const primaryButton =
  "press box-border h-9 cursor-pointer rounded-login border-0 bg-primary px-3 font-sans text-[14px] font-medium text-white hover:enabled:bg-primary-hover disabled:cursor-default disabled:opacity-45 max-md:h-11 max-md:text-[16px]";
export const secondaryButton =
  "press box-border h-9 cursor-pointer rounded-login border border-rule bg-transparent px-3 font-sans text-[14px] text-ink hover:border-ink max-md:h-11 max-md:text-[16px]";
export const quietLink = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] leading-5 text-ink-soft hover:text-ink max-md:text-[14px]";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="box-border flex min-h-screen items-center justify-center px-4 py-12 text-[14px] leading-5 max-md:px-6">
      <div className="flex w-full max-w-[280px] flex-col items-center max-md:max-w-[440px]">
        <Crosshair size={56} label="Sleuthhound" className="sh-in block" />
        {children}
      </div>
    </main>
  );
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="mt-8 mb-0 text-center text-[16px] leading-6 font-medium text-ink">{title}</h1>
      {children ? <p className="mt-2 mb-0 text-center [overflow-wrap:anywhere] text-ink-soft">{children}</p> : null}
    </>
  );
}
