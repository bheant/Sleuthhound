"use client";

import { useSyncExternalStore } from "react";
import { PHONE_QUERY } from "./phone";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the phone layout is showing. False on the server and the first paint. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
