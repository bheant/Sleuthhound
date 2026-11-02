import type { ReactNode } from "react";

type Props = { children: ReactNode; size?: "default" | "xl" };

// The page title section: 96px under the header, fluid light heading.
export function PageHeading({ children, size = "default" }: Props) {
  return (
    <section className="px-gutter pt-24">
      <h1 className={`sh-in m-0 ${size === "xl" ? "type-page-title-xl" : "type-page-title"}`}>{children}</h1>
    </section>
  );
}
