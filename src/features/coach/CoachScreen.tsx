import type { ActivitySummary } from "../../types";
import { formatClock } from "../../lib/time";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { StatusChip } from "../../ui/StatusChip";
import { SurfaceCard } from "../../ui/SurfaceCard";

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
        <EmptyState
          title="The coach wakes up after the work."
          detail="Save an activity first. Alpaca will generate restrained notes from distance, splits, load, and body context instead of spamming generic motivation."
        />
      ) : (
        <div className="space-y-5 pt-2">
          <section>
            <SurfaceCard
              className="px-6 py-7"
              style={{
                background: "transparent",
                borderColor: "var(--color-border-strong)",
              }}
            >
              <button onClick={() => onOpenDetail(lead.id)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-4">
                  <span
                    aria-hidden="true"
                    style={{
                      width: "0.58rem",
                      height: "0.58rem",
                      borderRadius: "999px",
                      background: "var(--color-accent)",
                      flexShrink: 0,
                      marginTop: "0.2rem",
                    }}
                  />
                  <StatusChip
                    label={coachReady(lead, currentPromptVersion) ? "Ready" : lead.comment_status === "pending" ? "..." : "..."}
                    tone={coachReady(lead, currentPromptVersion) ? "accent" : "neutral"}
                  />
                </div>

                <div
                  style={{
                    marginTop: "1.25rem",
                    maxWidth: "18rem",
                    color: "var(--color-text)",
                    fontSize: "clamp(1.9rem, 7vw, 2.8rem)",
                    lineHeight: 0.96,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {lead.comment_headline || lead.name}
                </div>

                <div
                  style={{
                    marginTop: "1rem",
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
            </SurfaceCard>
          </section>

          {archive.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span
                  aria-hidden="true"
                  style={{
                    width: "0.4rem",
                    height: "0.4rem",
                    borderRadius: "999px",
                    background: "var(--color-accent)",
                  }}
                />
                <div
                  style={{
                    color: "var(--color-text-dim)",
                    fontFamily: "var(--font-sharp)",
                    fontSize: "0.72rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {noted.length}
                </div>
              </div>

              <SurfaceCard
                className="px-5 py-2"
                style={{
                  background: "transparent",
                  borderColor: "var(--color-border)",
                }}
              >
                {archive.map((activity, index) => (
                  <button
                    key={activity.id}
                    onClick={() => onOpenDetail(activity.id)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                    style={{ borderBottom: index === archive.length - 1 ? "none" : "1px solid var(--color-border)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: "1.02rem", lineHeight: 1.12, letterSpacing: "-0.02em", color: "var(--color-text)" }}>
                        {activity.comment_headline || activity.name}
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
                    </div>
                    <span
                      aria-hidden="true"
                      style={{
                        width: "0.38rem",
                        height: "0.38rem",
                        borderRadius: "999px",
                        background: coachReady(activity, currentPromptVersion) ? "var(--color-accent)" : "transparent",
                        border: coachReady(activity, currentPromptVersion) ? "none" : "1px solid var(--color-text-dim)",
                        flexShrink: 0,
                      }}
                    />
                  </button>
                ))}
              </SurfaceCard>
            </section>
          ) : null}
        </div>
      )}
    </PullToRefresh>
  );
}
