interface StatusChipProps {
  label: string;
  tone?: "neutral" | "accent" | "warning" | "danger";
}

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  const palette = {
    neutral: { background: "transparent", borderColor: "var(--color-border)", color: "var(--color-text-soft)", dot: "transparent" },
    accent: { background: "transparent", borderColor: "rgba(90,230,222,0.22)", color: "var(--color-text)", dot: "var(--color-accent)" },
    warning: { background: "transparent", borderColor: "var(--color-border)", color: "var(--color-text-soft)", dot: "transparent" },
    danger: { background: "transparent", borderColor: "rgba(90,230,222,0.22)", color: "var(--color-text)", dot: "var(--color-accent)" },
  }[tone];

  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1.5"
      style={{
        ...palette,
        fontFamily: "var(--font-sharp)",
        fontSize: "0.72rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "0.38rem",
          height: "0.38rem",
          borderRadius: "999px",
          background: palette.dot,
          marginRight: "0.52rem",
          opacity: tone === "accent" ? 1 : 0.18,
        }}
      />
      {label}
    </span>
  );
}
