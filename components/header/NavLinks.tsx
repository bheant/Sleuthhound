"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVault } from "@/components/vault/useVault";

export const LINKS = [
  { href: "/", label: "Home" },
  { href: "/companies", label: "Companies" },
  { href: "/clients", label: "Clients" },
  { href: "/connections", label: "Connections" },
] as const;

const ADMIN = { href: "/admin", label: "Admin" } as const;

/** The pages in the nav, with Admin for admins. */
export function useLinks() {
  const admin = useVault().user?.role === "admin";
  return admin ? [...LINKS, ADMIN] : LINKS;
}

export function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();
  const links = useLinks();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-x-9 gap-y-2">
      {links.map(({ href, label }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`border-b pb-1 no-underline transition-colors duration-100 ${
              current ? "border-ink text-ink" : "border-transparent text-ink-nav hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
