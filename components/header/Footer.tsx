"use client";

import { useVault } from "@/components/vault/useVault";
import { leaveDemo, logOutAccount } from "@/lib/vault/session";

const quiet = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] leading-5 text-ink-secondary hover:text-ink";

/** The signed-in email and Log out, or in the sample workspace, Create account and Leave. */
export function SessionLinks({ demo }: { demo: boolean }) {
  const email = useVault().user?.email;
  if (demo) {
    return (
      <>
        <span>Sample workspace, made-up data</span>
        <button type="button" onClick={() => void leaveDemo({ signUp: true })} className={quiet}>
          Create account
        </button>
        <button type="button" onClick={() => void leaveDemo()} className={quiet}>
          Leave sample
        </button>
      </>
    );
  }
  // One line: a long email is cut short with an ellipsis rather than wrapping.
  return (
    <span className="flex max-w-full min-w-0 items-center gap-4">
      {email ? (
        <span className="min-w-0 truncate" title={email}>
          {email}
        </span>
      ) : null}
      <button type="button" onClick={() => void logOutAccount()} className={`${quiet} shrink-0`}>
        Log out
      </button>
    </span>
  );
}

export function Footer({ demo }: { demo: boolean }) {
  return (
    <footer className="mt-40 flex flex-wrap justify-end gap-4 border-t border-subtle px-gutter pt-8 pb-12 max-md:mt-24 max-md:justify-start max-md:pt-6 max-md:pb-8 text-[14px] leading-5 text-ink-muted">
      <SessionLinks demo={demo} />
    </footer>
  );
}
