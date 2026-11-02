import type { Metadata } from "next";
import { HomePage } from "./HomePage";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <HomePage />;
}
