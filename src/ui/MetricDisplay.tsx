import type { ReactNode } from "react";

interface MetricDisplayProps {
  value: ReactNode;
  label: string;
  emphasis?: "hero" | "primary" | "secondary";
  align?: "center" | "left";
}

export function MetricDisplay({ value, label, emphasis = "primary", align = "center" }: MetricDisplayProps) {
  const fontSize = emphasis === "hero" ? "clamp(5.6rem, 20vw, 8.8rem)" : emphasis === "primary" ? "2.2rem" : "1.55rem";
  const letterSpacing = emphasis === "hero" ? "-0.045em" : "-0.02em";
  return (
    <div className={`andes-count-in ${align === "center" ? "text-center" : "text-left"}`}>
      <div
        className="tabular-nums"
        style={{
          fontSize,
          letterSpacing,
          lineHeight: emphasis === "hero" ? 0.9 : 0.96,
          fontWeight: emphasis === "hero" ? 500 : 400,
          color: "var(--color-text)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: emphasis === "hero" ? "0.9rem" : "0.35rem",
          color: "var(--color-text-dim)",
          fontFamily: "var(--font-sharp)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          fontSize: emphasis === "hero" ? "0.98rem" : "0.74rem",
        }}
      >
        {label}
      </div>
    </div>
  );
}
