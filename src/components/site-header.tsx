import Link from "next/link";
import { AccountNav } from "./account-nav";
import { CloudIcon } from "./cloud-icon";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="site-header">
      <Link href="/" aria-label="Cloudrop home" className="flex shrink-0 items-center gap-2 font-heading text-[22px] font-medium tracking-[-0.06em]">
        <span className="flex size-8 items-center justify-center text-accent">
          <CloudIcon className="size-6" />
        </span>
        <span>cloudrop<span className="text-accent">.</span></span>
      </Link>
      <AccountNav signedIn={signedIn} />
    </header>
  );
}
