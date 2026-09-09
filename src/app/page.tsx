import { CloudIcon } from "@/components/cloud-icon";
import { FileUploader } from "@/components/file-uploader";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 sm:px-10">
      <header className="flex items-center justify-between gap-5 py-7 sm:py-9">
        <Link href="/" aria-label="Cloudrop home" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-white">
            <CloudIcon className="size-6" />
          </span>
          <span className="font-heading">cloudrop<span className="text-accent">.</span></span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#about" className="text-sm text-muted transition-colors hover:text-foreground">About Cloudrop <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center pb-14 pt-12 sm:pb-20 sm:pt-16">
        <div className="mb-6 flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-muted uppercase">
          <span className="size-1.5 rounded-full bg-accent" /> Less friction. More flow.
        </div>
        <h1 className="text-center font-heading text-[clamp(2.6rem,7vw,4.5rem)] leading-[1.08] font-medium tracking-[-0.06em]">
          A little less <span className="text-accent">attached.</span>
        </h1>
        <p className="mt-5 max-w-md text-center text-base leading-7 text-muted sm:text-lg">
          Big ideas. Small files. Everything in between.<br className="hidden sm:block" /> A simpler way to share, then let go.
        </p>

        <FileUploader />

        <p className="mt-6 flex max-w-md items-start justify-center gap-2 text-center text-xs leading-5 text-muted sm:text-sm">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 size-4 shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          Automatic expiration is coming later. Uploaded files do not expire yet.
        </p>
      </main>

      <footer id="about" className="flex flex-col items-center justify-between gap-3 border-t border-line py-6 text-center text-xs leading-5 text-muted sm:flex-row">
        <p>Made for passing things along.</p>
        <p>Cloudrop · Early access <span className="mx-2 text-[#c3c7cf]" aria-hidden="true">/</span> Private uploads. Temporary sharing.</p>
      </footer>
    </div>
  );
}
import Link from "next/link";
