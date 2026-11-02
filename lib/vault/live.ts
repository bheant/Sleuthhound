import { useMemo, useSyncExternalStore } from "react";

// Pages read the database during render, the way server pages used to. After
// a change worth showing, refresh() asks every page to read again: it stands
// in for revalidatePath and router.refresh. Calls in quick succession, as
// during a run, are folded into one.

let version = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function refresh(): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    version++;
    for (const listener of listeners) listener();
  }, 0);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Increments after each refresh(). */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/**
 * Reads page data, and reads it again after each refresh() or when the key
 * changes. The key names everything `read` depends on, such as the
 * workspace and the selected company.
 */
export function usePageData<T>(read: () => T, key: string): T {
  const v = useDataVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(), [v, key]);
}
