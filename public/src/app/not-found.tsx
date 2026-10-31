import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center"
    >
      <Link href="/" aria-label="AVEN home">
        <Logo />
      </Link>
      <p className="type-eyebrow text-accent mt-10">404</p>
      <h1 className="type-page mt-2">This page doesn&apos;t exist</h1>
      <p className="text-ink-muted mt-3 text-sm">
        It may have moved, or it may belong to a part of AVEN that hasn&apos;t been built yet.
      </p>
      <ButtonLink href="/" className="mt-8">
        Go home
      </ButtonLink>
    </main>
  );
}
