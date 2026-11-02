import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Crosshair } from "@/components/ui/Crosshair";
import { OPERATOR, SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy" };

// Public: readable without an account or the sample workspace.

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-20 max-md:mt-14">
      <h2 className="m-0 text-[24px] leading-8 font-light">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-[16px] leading-[26px] text-ink-secondary [&_strong]:font-normal [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto box-border max-w-[760px] px-gutter pt-16 pb-32">
      <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
        <Crosshair size={24} />
        <span className="text-[20px] leading-7">Sleuthhound</span>
      </Link>
      <h1 className="type-page-title-xl mt-20 mb-0">Privacy</h1>
      <p className="type-lede mt-6 mb-0">
        Your leads, sources, files, notes and API keys stay on your device, encrypted with your password. We only know who you are and when you log in.
      </p>

      <Part title="Who we are">
        <p className="m-0">
          {SITE} is run by {OPERATOR.name}. For anything about your data, email {OPERATOR.email}.
        </p>
      </Part>

      <Part title="What we store">
        <p className="m-0">For your account, on our servers:</p>
        <p className="m-0">
          <strong>Your name, email and company</strong>, as you entered them.
        </p>
        <p className="m-0">
          <strong>When you signed up and last used Sleuthhound</strong>, and the time of each log-in with the country it came from, as reported by our host, Cloudflare.
        </p>
        <p className="m-0">
          <strong>A check value made from your password</strong>, never the password. Your browser turns the password into two keys and sends us only one of them; we keep a
          salted hash of it.
        </p>
        <p className="m-0">
          <strong>Your data key, locked</strong>. It’s sealed in your browser with keys made from your password and your recovery code, neither of which we ever see, so we
          can’t open it. We keep it so you can unlock on another device.
        </p>
        <p className="m-0">
          <strong>Your session</strong>, for up to 30 days, so you stay logged in.
        </p>
        <p className="m-0">
          To stop password guessing we count log-in and sign-up attempts by IP address. We keep only a one-way hash of the address, and only for up to an hour.
        </p>
      </Part>

      <Part title="What never leaves your device">
        <p className="m-0">
          Everything you work with in Sleuthhound: companies, conversations, AI reviews, decisions, sources, uploaded files, notes and API keys. It’s stored in your browser,
          encrypted with your data key, and never sent to us. We have no way to read it.
        </p>
        <p className="m-0">
          When Sleuthhound uses one of your keys, your browser sends the request straight to that provider, such as Anthropic, OpenAI, xAI or Companies House, and their own
          privacy terms apply. Apollo and HubSpot don’t accept requests from browsers, so those pass through our server on the way, without being stored or logged.
        </p>
        <p className="m-0">
          One honest limit: Sleuthhound’s code is served from {SITE}, so you trust that code to keep your data on your device, as with any web app.
        </p>
      </Part>

      <Part title="Cookies and tracking">
        <p className="m-0">One cookie, which keeps you logged in. No analytics, no advertising, no tracking.</p>
      </Part>

      <Part title="How long we keep it">
        <p className="m-0">Your account and its log-in history are kept until you delete the account. Ended sessions and attempt counts are removed automatically.</p>
      </Part>

      <Part title="Deleting your account">
        <p className="m-0">
          In Sleuthhound, open Settings, then Delete account. That removes your name, email, company and log-in history from our servers at once, and the data in that browser.
          You can also email {OPERATOR.email} and we’ll delete it for you.
        </p>
      </Part>
    </main>
  );
}
