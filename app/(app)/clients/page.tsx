import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientsPage } from "./ClientsPage";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  return (
    <Suspense>
      <ClientsPage />
    </Suspense>
  );
}
