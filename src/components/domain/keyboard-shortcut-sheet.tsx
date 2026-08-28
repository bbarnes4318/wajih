"use client";

import { Modal } from "@/components/ui/modal";

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "j / k", description: "Move focus to the next / previous row" },
  { keys: "x", description: "Toggle selection on the focused row" },
  { keys: "a", description: "Accept the focused row" },
  { keys: "d", description: "Open the dispute modal for the focused row" },
  { keys: "Enter", description: "Open the focused row in the drawer" },
  { keys: "⌘K / Ctrl+K", description: "Open the command palette" },
  { keys: "?", description: "Show this shortcut sheet" },
];

export function KeyboardShortcutSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="sm">
      <ul className="space-y-2.5">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-3">
            <span className="text-body text-muted">{s.description}</span>
            <kbd className="shrink-0 rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-meta text-ink">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-meta text-faint">
        Shortcuts are disabled while a text field has focus.
      </p>
    </Modal>
  );
}
