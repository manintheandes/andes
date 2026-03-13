import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?: string;
  icon?: ReactNode;
  detail?: string;
}

export function SectionHeader({ eyebrow, icon, detail }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div
        className="inline-flex items-center gap-2"
        style={{
          fontFamily: "var(--font-sharp)",
          textTransform: "uppercase",
          fontSize: "0.72rem",
          letterSpacing: "0.16em",
          color: "var(--color-text-dim)",
        }}
      >
        {icon ?? null}
        {eyebrow}
      </div>
      {detail ? <div style={{ color: "var(--color-text-dim)", fontSize: "0.9rem", maxWidth: "13rem", textAlign: "right" }}>{detail}</div> : null}
    </div>
  );
}
