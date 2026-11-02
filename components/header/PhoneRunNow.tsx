import { RunNowButton } from "./RunNowButton";

// Run now on phone: the header has no room for it, so Home, Clients and
// Connections show it full width in the page.
export function PhoneRunNow({ className = "mt-10" }: { className?: string }) {
  return (
    <div className={`md:hidden ${className}`}>
      <RunNowButton wide />
    </div>
  );
}
