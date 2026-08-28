import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bento-grid panel. `dense` removes body padding for panels whose content is
 * a full-bleed table.
 */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel-glow flex flex-col overflow-hidden", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-3 border-b border-line px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-faint">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-ui font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-snug text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function PanelBody({
  children,
  className,
  dense = false,
}: {
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div className={cn(dense ? "" : "p-4", "min-w-0 flex-1", className)}>
      {children}
    </div>
  );
}

export function PanelFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted",
        className,
      )}
    >
      {children}
    </footer>
  );
}
