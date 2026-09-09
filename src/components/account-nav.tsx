import Link from "next/link";

export function AccountNav({ signedIn }: { signedIn: boolean }) {
  return <nav aria-label="Account" className="account-nav">
    {signedIn ? <>
      <Link href="/my-uploads" className="account-link">My uploads</Link>
      <form action="/auth/logout" method="post"><button type="submit" className="account-link account-secondary">Sign out</button></form>
    </> : <>
      <a href="/auth/start" className="account-link">Sign in</a>
      <a href="/auth/start?mode=signup" className="account-link account-secondary">Sign up</a>
    </>}
  </nav>;
}
