import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-app p-8 text-center">
      <Compass className="size-8 text-faint" />
      <h1 className="text-lede font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="max-w-sm text-body text-muted">
        The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t have access
        to it.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-[44px] items-center rounded-md bg-accent px-4 text-ui font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Back to LeadOS
      </Link>
    </div>
  );
}
