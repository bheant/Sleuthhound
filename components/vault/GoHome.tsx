"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// /signup and /sample are ways in. AppShell shows sign-up or opens the sample
// for them; once the app is open, this moves on to Home.
export function GoHome() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return null;
}
