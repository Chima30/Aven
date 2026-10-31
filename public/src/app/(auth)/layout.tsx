import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 py-5 sm:px-8">
        <Link href="/" aria-label="AVEN home" className="rounded-lg">
          <Logo />
        </Link>
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-5 pt-6 pb-16 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      <footer className="text-ink-subtle px-5 py-6 text-center text-xs">
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
      </footer>
    </div>
  );
}
