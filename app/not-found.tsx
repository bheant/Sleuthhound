import Link from "next/link";
import { AuthHeading, AuthShell, quietLink } from "@/components/vault/auth-ui";

export default function NotFound() {
  return (
    <AuthShell>
      <AuthHeading title="Page not found">There’s nothing at this address.</AuthHeading>
      <Link href="/" className={`${quietLink} mt-6 no-underline`}>
        Go to Sleuthhound
      </Link>
    </AuthShell>
  );
}
