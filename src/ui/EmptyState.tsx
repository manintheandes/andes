import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
  actionLabel?: string;
}

export function EmptyState({ title, actionIcon, onAction, actionLabel }: EmptyStateProps) {
  return (
    <div className="py-10 text-left">
      <div style={{ maxWidth: "20rem", fontSize: "1.8rem", lineHeight: 0.96, letterSpacing: "-0.03em" }}>{title}</div>
      {actionIcon && onAction ? (
        <button
          onClick={onAction}
          className="mt-6 flex items-center justify-center rounded-full"
          style={{ width: 48, height: 48, border: "1px solid rgba(90,230,222,0.28)" }}
          aria-label={actionLabel}
        >
          {actionIcon}
        </button>
      ) : null}
    </div>
  );
}
