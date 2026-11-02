import type { Metadata } from "next";
import { GoHome } from "@/components/vault/GoHome";

export const metadata: Metadata = { title: "Sample workspace" };

export default function Page() {
  return <GoHome />;
}
