interface StatRowProps {
  label: string;
  value: string;
  tone?: "default" | "accent";
}

export function StatRow({ label, value, tone = "default" }: StatRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span style={{ color: "var(--color-text-dim)", fontSize: "0.92rem" }}>{label}</span>
      <span className="tabular-nums" style={{ color: tone === "accent" ? "var(--color-accent)" : "var(--color-text)", fontSize: "1rem" }}>
        {value}
      </span>
    </div>
  );
}
