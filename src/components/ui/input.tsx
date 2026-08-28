import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-line bg-sunken px-2.5 text-[14px] text-ink",
        "placeholder:text-faint focus:border-accent-border focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-line bg-sunken px-2.5 py-2 text-[14px] leading-relaxed text-ink",
        "placeholder:text-faint focus:border-accent-border focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** Native select, styled to match. Used where a full listbox is overkill. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full appearance-none rounded-md border border-line bg-sunken px-2.5 pr-7 text-[14px] text-ink",
        "focus:border-accent-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238f979f%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 flex items-center gap-1 text-[12px] font-medium tracking-wide text-muted uppercase">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[12px] leading-snug text-faint">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-[12px] leading-snug text-danger">{error}</span>
      )}
    </label>
  );
}
