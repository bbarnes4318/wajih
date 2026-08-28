import { cn } from "@/lib/utils";

/**
 * Renders a provider payload verbatim. Deliberately not a collapsible tree —
 * in a compliance drill-down the reader needs to see the whole response as it
 * was received, not a summary of it.
 */
export function JsonBlock({
  value,
  className,
  maxHeight = "20rem",
}: {
  value: unknown;
  className?: string;
  maxHeight?: string;
}) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-faint italic">No payload recorded.</p>;
  }

  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }

  return (
    <pre
      style={{ maxHeight }}
      className={cn(
        "overflow-auto rounded-md border border-line bg-sunken px-3 py-2.5",
        "font-mono text-meta leading-relaxed whitespace-pre text-muted",
        className,
      )}
    >
      {text}
    </pre>
  );
}
