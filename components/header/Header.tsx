import Link from "next/link";
import { SearchButton } from "@/components/search/SearchButton";
import { Crosshair } from "@/components/ui/Crosshair";
import { SettingsButton } from "./SettingsButton";
import { NavLinks } from "./NavLinks";
import { PhoneHeader } from "./PhoneHeader";
import { RunNowButton } from "./RunNowButton";

type Props = { demo: boolean };

const iconButton =
  "press flex size-[52px] cursor-pointer items-center justify-center border border-bright bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black";

// Run now reads the current run from RunStatusProvider, and Search opens the
// search overlay from CommandProvider; both are set up in the layout. Below
// 768px the phone header takes over.
export function Header({ demo }: Props) {
  return (
    <>
      <PhoneHeader demo={demo} />
      <header className="flex flex-wrap items-center justify-between gap-6 px-gutter pt-10 max-md:hidden">
        <div className="flex flex-wrap items-center gap-x-[72px] gap-y-6">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
            <Crosshair size={24} />
            <span className="text-[22px] leading-7 tracking-[-0.01em]">Sleuthhound</span>
          </Link>
          <NavLinks />
        </div>
        <div className="flex items-center gap-10">
          {demo ? (
            <span className="text-[14px] leading-5 text-ink-secondary" title="Made-up data. Nothing here reaches the network.">
              Sample workspace
            </span>
          ) : null}
          <RunNowButton />
          <div className="flex">
            <SearchButton className={iconButton} />
            <SettingsButton />
          </div>
        </div>
      </header>
    </>
  );
}
