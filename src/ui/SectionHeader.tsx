interface SectionHeaderProps {
  eyebrow: string;
  title?: string;
  detail?: string;
}

export function SectionHeader({ eyebrow, title, detail }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
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
          <span aria-hidden="true" style={{ width: "0.4rem", height: "0.4rem", borderRadius: "999px", background: "var(--color-accent)" }} />
          {eyebrow}
        </div>
        {title ? (
          <div style={{ marginTop: "0.7rem", fontSize: "1.82rem", lineHeight: 0.94, letterSpacing: "-0.025em" }}>
            {title}
          </div>
        ) : null}
      </div>
      {detail ? <div style={{ color: "var(--color-text-dim)", fontSize: "0.9rem", maxWidth: "13rem", textAlign: "right" }}>{detail}</div> : null}
    </div>
  );
}
