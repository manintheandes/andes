interface StatusChipProps {
  label: string;
  tone?: "neutral" | "accent" | "warning" | "danger";
  dotOnly?: boolean;
}

export function StatusChip({ label, tone = "neutral", dotOnly = false }: StatusChipProps) {
  const dotColor = tone === "accent" || tone === "danger" ? "var(--color-accent)" : "transparent";
  const dotOpacity = tone === "accent" ? 1 : 0.18;

  if (dotOnly) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "999px",
          background: dotColor,
          opacity: dotOpacity,
        }}
      />
    );
  }

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
