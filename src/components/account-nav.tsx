import Link from "next/link";

export function AccountNav({ signedIn }: { signedIn: boolean }) {
  return <nav aria-label="Account" className="flex items-center gap-4 text-sm">
    {signedIn ? <>
      <Link href="/my-uploads" className="text-muted hover:text-foreground">My uploads</Link>
      <form action="/auth/logout" method="post"><button type="submit" className="rounded-lg border border-line px-3 py-2 hover:bg-white">Sign out</button></form>
    </> : <>
      <a href="/auth/start" className="text-muted hover:text-foreground">Sign in</a>
      <a href="/auth/start?mode=signup" className="rounded-lg border border-line px-3 py-2 hover:bg-white">Sign up</a>
    </>}
  </nav>;
}
