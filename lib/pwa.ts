// Sleuthhound as an installed app: the service worker that keeps it working
// offline, and what the install prompt can offer in this browser.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let started = false;

/** Registers the service worker (built sites only) and listens for the browser's install offer. */
export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // No offline copy this time; the app works as normal.
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type InstallWay = "prompt" | "safari-mac" | "safari-ios" | null;

/** How this browser installs Sleuthhound, or null when it's installed already or can't. */
export function installWay(): InstallWay {
  if (typeof window === "undefined") return null;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (standalone) return null;
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "safari-ios";
  if (/Macintosh/.test(ua) && /Version\/\d+.*Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua)) return "safari-mac";
  return null;
}

/** Shows the browser's own install dialog. True when the user installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}
