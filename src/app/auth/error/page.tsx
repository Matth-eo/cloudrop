import Link from "next/link";

export default function AuthError() {
  return <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 text-center">
    <h1 className="font-heading text-3xl">Couldn’t sign you in</h1>
    <p className="mt-4 text-sm leading-6 text-muted">Your sign-in may have expired or been cancelled. Please try again. If this continues, check Cloudrop’s Cognito configuration.</p>
    <a href="/auth/start" className="mt-6 rounded-xl bg-accent px-5 py-3 text-white">Try signing in again</a>
    <Link href="/" className="mt-4 text-sm text-muted">Back to Cloudrop</Link>
  </main>;
}
