import type { ActivitySummary, BodySnapshot } from "../../types";
import { useMemo } from "react";
import { formatDuration } from "../../lib/utils/format";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { SectionHeader } from "../../ui/SectionHeader";
import { Sparkline } from "../../ui/Sparkline";
import { TrailDivider, SettingsIcon, SleepIcon } from "../home/HomeScreen";

interface SleepScreenProps {
  body: BodySnapshot | null;
  activities: ActivitySummary[];
  refreshing: boolean;
  syncing: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

function BigMetric({ value, label, accent }: { value: string | number | null; label: string; accent?: boolean }) {
  return (
    <>
      <div className="flex items-baseline justify-between px-1 py-4">
        <div
          className="tabular-nums"
          style={{
            fontSize: "4rem",
            fontWeight: 200,
            letterSpacing: "-0.04em",
            lineHeight: 0.95,
            color: accent && value != null && value !== "--" ? "var(--color-accent)" : value == null || value === "--" ? "var(--color-text-soft)" : undefined,
          }}
        >
          {value ?? "--"}
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      </div>
      <TrailDivider variant="wave" />
    </>
  );
}

/** Extract HR averages from recent activities for a mini trend chart. */
function useHrTrend(activities: ActivitySummary[]): number[] {
  return useMemo(() => {
    return activities
      .filter((a) => a.average_heartrate != null)
      .slice(0, 14)
      .reverse()
      .map((a) => a.average_heartrate as number);
  }, [activities]);
}

export function SleepScreen({ body, activities, refreshing, syncing, onRefresh, onOpenSettings }: SleepScreenProps) {
  const hrTrend = useHrTrend(activities);

  // Gather body-linked data from activities (those with body snapshots)
  const recentHRAvg = useMemo(() => {
    const hrActivities = activities.filter((a) => a.average_heartrate).slice(0, 7);
    if (hrActivities.length === 0) return null;
    return Math.round(hrActivities.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / hrActivities.length);
  }, [activities]);

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing || syncing}>
      {!body ? (
        <EmptyState
          title="No body data yet."
          actionIcon={<SettingsIcon size={18} />}
          onAction={onOpenSettings}
          actionLabel="Open settings"
        />
      ) : (
        <div className="pt-2">
          {/* Primary body metrics */}
          <BigMetric value={body.sleep_score} label="sleep" />
          <BigMetric value={body.readiness_score} label="ready" />
          <BigMetric value={body.hrv} label="hrv" accent />
          <BigMetric value={body.rhr} label="rhr" />

          {/* Total sleep duration */}
          {body.total_sleep ? (
            <div className="flex items-baseline justify-between px-1 py-4">
              <div className="tabular-nums" style={{ fontSize: "2.4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
                {formatDuration(body.total_sleep)}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>total sleep</div>
            </div>
          ) : null}

          {/* Readiness contributors */}
          {body.contributors && Object.keys(body.contributors).length > 0 ? (
            <section className="mt-6">
              <SectionHeader eyebrow="contributors" />
              <div>
                {Object.entries(body.contributors)
                  .filter(([, value]) => value != null)
                  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                  .map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between px-1 py-2"
                      style={{ borderBottom: "1px solid var(--color-border)" }}
                    >
                      <span style={{ color: "var(--color-text-dim)", fontSize: "0.88rem", textTransform: "capitalize" }}>
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="tabular-nums" style={{ fontSize: "0.92rem" }}>{value}</span>
                    </div>
                  ))}
              </div>
            </section>
          ) : null}

          {/* Activity HR trend */}
          {hrTrend.length > 2 ? (
            <section className="mt-8">
              <SectionHeader eyebrow="recent activity hr" detail={recentHRAvg ? `avg ${recentHRAvg}` : undefined} />
              <div className="px-1 py-2">
                <Sparkline data={hrTrend} height={48} color="var(--color-accent)" />
              </div>
              <div className="flex items-center justify-between px-1 mt-1">
                <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.64rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {activities.filter((a) => a.average_heartrate).length > 14 ? "14 recent" : `${hrTrend.length} activities`}
                </span>
                <span className="tabular-nums" style={{ color: "var(--color-text-dim)", fontSize: "0.78rem" }}>
                  {Math.round(Math.min(...hrTrend))} - {Math.round(Math.max(...hrTrend))} bpm
                </span>
              </div>
            </section>
          ) : null}

          {/* Metadata */}
          <div className="mt-8 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-text-dim)", fontSize: "0.78rem" }}>
                {body.status === "ready" ? "Updated" : body.status}
              </span>
              <span style={{ color: "var(--color-text-dim)", fontSize: "0.78rem" }}>
                {body.source_day}
              </span>
            </div>
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
