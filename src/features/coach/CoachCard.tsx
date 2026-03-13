import type { CoachComment } from "../../types";
import { CoachIcon, TrailDivider } from "../home/HomeScreen";

interface CoachCardProps {
  comment: CoachComment | null;
  status: "idle" | "pending" | "ready" | "error";
  onGenerate: () => void;
}

export function CoachCard({ comment, status, onGenerate }: CoachCardProps) {
  return (
    <section>
      <TrailDivider variant="brush" />
      <div className="py-6">
        {comment ? (
          <div style={{ color: "var(--color-text-soft)", lineHeight: 1.62, fontSize: "1rem" }}>
            {comment.summary}
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
      </div>
    </section>
  );
}
