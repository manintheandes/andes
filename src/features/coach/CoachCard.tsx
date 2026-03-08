import type { CoachComment } from "../../types";
import { StatusChip } from "../../ui/StatusChip";
import { CoachIcon } from "../home/HomeScreen";

interface CoachCardProps {
  comment: CoachComment | null;
  status: "idle" | "pending" | "ready" | "error";
  onGenerate: () => void;
}

export function CoachCard({ comment, status, onGenerate }: CoachCardProps) {
  const tone = status === "ready" ? "accent" : "neutral";

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <CoachIcon size={28} />
        <StatusChip label={status === "pending" ? "..." : status === "ready" ? "Ready" : status === "error" ? "Retry" : "Generate"} tone={tone} />
      </div>

      {comment ? (
        <div>
          <div style={{ marginTop: "0.4rem", fontSize: "1.65rem", lineHeight: 0.96, letterSpacing: "-0.03em" }}>
            {comment.headline}
          </div>
          <div className="mt-4 space-y-4 rounded-[28px] border px-5 py-5" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.012)" }}>
            <div style={{ color: "var(--color-text-soft)", lineHeight: 1.62, fontSize: "1rem" }}>{comment.summary}</div>
            <div className="space-y-2">
              {comment.bullets.map((bullet) => (
                <div key={bullet} className="flex gap-3">
                  <span style={{ color: "var(--color-accent)" }}>·</span>
                  <span style={{ color: "var(--color-text-soft)", lineHeight: 1.55 }}>{bullet}</span>
                </div>
              ))}
            </div>
            {comment.caution ? (
              <div className="rounded-[22px] border px-4 py-3" style={{ borderColor: "var(--color-border)", color: "var(--color-text-dim)" }}>
                {comment.caution}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          onClick={onGenerate}
          className="transition-opacity active:opacity-50"
          aria-label="Generate note"
        >
          <CoachIcon size={36} color="rgba(90,230,222,0.4)" />
        </button>
      )}
    </section>
  );
}
