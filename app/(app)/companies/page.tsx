import type { Metadata } from "next";
import { Suspense } from "react";
import { CompaniesPage } from "./CompaniesPage";

export const metadata: Metadata = { title: "New companies" };

export default function Page() {
  return (
    <Suspense>
      <CompaniesPage />
    </Suspense>
  );
}
