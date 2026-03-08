interface EmptyStateProps {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, detail, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="border-y py-10 text-left" style={{ borderColor: "var(--color-border)" }}>
      <div style={{ maxWidth: "32rem", fontSize: "2.1rem", lineHeight: 0.96, letterSpacing: "-0.03em" }}>{title}</div>
      <div style={{ marginTop: "0.85rem", maxWidth: "32rem", color: "var(--color-text-dim)", lineHeight: 1.5 }}>{detail}</div>
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className="mt-6 rounded-full border px-5 py-3"
          style={{ borderColor: "rgba(90,230,222,0.28)", color: "var(--color-accent)", fontFamily: "var(--font-sharp)", letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.72rem" }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
