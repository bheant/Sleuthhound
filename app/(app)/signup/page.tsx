import type { Metadata } from "next";
import { GoHome } from "@/components/vault/GoHome";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return <GoHome />;
}
