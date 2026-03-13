import type { ActivitySummary } from "../../types";
import { formatClock } from "../../lib/time";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { TrailDivider } from "../home/HomeScreen";

interface CoachScreenProps {
  activities: ActivitySummary[];
  currentPromptVersion: string;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenDetail: (id: string) => void;
}

function coachReady(activity: ActivitySummary, promptVersion: string) {
  return activity.comment_status === "ready" && activity.comment_prompt_version === promptVersion;
}

export function CoachScreen({ activities, currentPromptVersion, refreshing, onRefresh, onOpenDetail }: CoachScreenProps) {
  const noted = activities.filter((activity) => coachReady(activity, currentPromptVersion));
  const lead =
    noted[0] ??
    activities.find((activity) => !coachReady(activity, currentPromptVersion)) ??
    activities[0] ??
    null;
  const archive = activities.filter((activity) => activity.id !== lead?.id).slice(0, 8);

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing}>
      {!lead ? (
        <EmptyState title="After the work." />
      ) : (
        <div className="pt-2">
          <section>
            <button onClick={() => onOpenDetail(lead.id)} className="block w-full text-left">
              <div
                style={{
                  marginTop: "1.25rem",
                  maxWidth: "22rem",
                  color: "var(--color-text-soft)",
                  lineHeight: 1.62,
                  fontSize: "0.98rem",
                }}
              >
                {lead.comment_preview || ""}
              </div>

              <div className="mt-5" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {formatClock(lead.start_date_local)}
              </div>
            </button>
          </section>

          {archive.length > 0 ? (
            <section className="mt-8">
              <div>
                {archive.map((activity) => (
                  <div key={activity.id}>
                    <TrailDivider variant="brush" />
                    <button
                      onClick={() => onOpenDetail(activity.id)}
                      className="w-full py-5 text-left"
                    >
                      <div style={{ color: "var(--color-text-soft)", lineHeight: 1.5, fontSize: "0.95rem" }}>
                        {activity.comment_preview || activity.name}
                      </div>
                      <div
                        style={{
                          marginTop: "0.35rem",
                          color: "var(--color-text-dim)",
                          fontFamily: "var(--font-sharp)",
                          fontSize: "0.72rem",
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                        }}
                      >
                        {formatClock(activity.start_date_local)}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </PullToRefresh>
  );
}
