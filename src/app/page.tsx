import { CloudIcon } from "@/components/cloud-icon";
import { FileUploader } from "@/components/file-uploader";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="site-shell">
      <SiteHeader signedIn={!!user} />
      <main className="sharing-layout">
        <div className="sharing-intro">
          <p className="eyebrow">A place to pass things along</p>
          <h1 className="sharing-title">Good things.<br />Brief stays.</h1>
          <p className="sharing-description">A file. A link. A little less attached.<br />Share what matters, for just as long as it needs to stay.</p>
          <p className="sharing-aside">Private uploads.<br />No account needed to download.</p>
        </div>
        <div className="sharing-workspace">
          {user ? <FileUploader /> : (
            <section aria-label="Sign in to upload" className="signin-surface">
              <CloudIcon className="mb-8 size-14 text-accent" />
              <p className="eyebrow">Your next handoff starts here</p>
              <h2 className="mt-4 font-heading text-4xl font-medium tracking-[-0.05em]">Make room<br />for sharing.</h2>
              <p className="mt-5 max-w-xs text-sm leading-7 text-muted">Sign in to upload and find your shared files. Recipients can download without an account.</p>
              <a href="/auth/start" className="primary-action mt-8 inline-flex min-h-12 items-center justify-center rounded-lg px-8 text-sm font-medium">Sign in to upload</a>
              <p className="mt-5 text-xs text-muted">New here? <a href="/auth/start?mode=signup" className="ml-1 text-foreground underline underline-offset-4">Create an account</a></p>
            </section>
          )}
        </div>
      </main>
      <footer className="site-footer"><p>cloudrop / temporary by design</p><p>Made for passing things along.</p></footer>
    </div>
  );
}
