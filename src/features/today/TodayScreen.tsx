import type { ActivitySummary, BodySnapshot } from "../../types";
import { daysAgoKey, formatClock } from "../../lib/time";
import { formatBodyDuration, formatDistance, formatDuration, formatPace, formatSpeed } from "../../lib/utils/format";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { SectionHeader } from "../../ui/SectionHeader";
import { StatusChip } from "../../ui/StatusChip";
import { StaticMap } from "../../ui/StaticMap";

interface TodayScreenProps {
  activities: ActivitySummary[];
  allActivities: ActivitySummary[];
  body: BodySnapshot | null;
  mapboxToken: string;
  refreshing: boolean;
  hasStravaCredentials: boolean;
  hasOuraToken: boolean;
  onRefresh: () => void;
  onRefreshBody: () => void;
  onImportStrava: () => void;
  onOpenDetail: (id: string) => void;
  onOpenRecorder: () => void;
  onOpenSettings: () => void;
}

function weekLoad(activities: ActivitySummary[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = daysAgoKey(6 - index);
    const dayActivities = activities.filter((activity) => activity.start_date_local.startsWith(day));
    const minutes = dayActivities.reduce((sum, activity) => sum + activity.moving_time / 60, 0);
    return { day, label: new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" }), minutes };
  });
}

export function TodayScreen({ activities, allActivities, body, mapboxToken, refreshing, hasStravaCredentials, hasOuraToken, onRefresh, onRefreshBody, onImportStrava, onOpenDetail, onOpenRecorder, onOpenSettings }: TodayScreenProps) {
  const latest = activities[0];
  const load = weekLoad(allActivities);
  const maxLoad = Math.max(...load.map((item) => item.minutes), 30);
  const needsStravaImport = allActivities.length === 0;
  const needsBodyRefresh = !body || body.status !== "ready";

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing}>
      {!latest ? (
        <EmptyState title="Ready when you are." detail="Press record and Alpaca will lock onto GPS, connect COROS, and save the session cleanly." actionLabel="Record" onAction={onOpenRecorder} />
      ) : (
        <div className="mb-10 border-b pb-8" style={{ borderColor: "var(--color-border)" }}>
          <button onClick={() => onOpenDetail(latest.id)} className="w-full text-left">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div style={{ fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.74rem", color: "var(--color-text-dim)" }}>
                    Latest Activity
                  </div>
                  <StatusChip label={formatClock(latest.start_date_local)} tone="neutral" />
                </div>
                <div style={{ fontSize: "clamp(3rem, 7vw, 5rem)", lineHeight: 0.94, letterSpacing: "-0.05em", maxWidth: "32rem" }}>
                  {latest.name}
                </div>
                <div style={{ marginTop: "0.8rem", color: "var(--color-text-dim)", maxWidth: "26rem", lineHeight: 1.5 }}>
                  {latest.comment_preview || "Saved cleanly with distance, pace, heart rate, and body context available in one place."}
                </div>
              </div>

              <div className="border-t pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" style={{ borderColor: "var(--color-border)" }}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.68rem" }}>Distance</div>
                    <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "2.25rem", letterSpacing: "-0.03em" }}>{formatDistance(latest.distance)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.68rem" }}>Pace</div>
                    <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "2.25rem", letterSpacing: "-0.03em" }}>
                      {latest.type === "Ride" ? formatSpeed(latest.average_speed) : formatPace(latest.average_speed)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.68rem" }}>Heart Rate</div>
                    <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "2.25rem", letterSpacing: "-0.03em", color: latest.average_heartrate ? "var(--color-accent)" : "var(--color-text-soft)" }}>{latest.average_heartrate ? Math.round(latest.average_heartrate) : "--"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.68rem" }}>Time</div>
                    <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "2.25rem", letterSpacing: "-0.03em" }}>{formatDuration(latest.moving_time)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
              <StaticMap polyline={latest.summary_polyline} token={mapboxToken} height={156} />
            </div>
          </button>
        </div>
      )}

      {(needsStravaImport || needsBodyRefresh) ? (
        <div className="mb-8 border-t pb-1 pt-6" style={{ borderColor: "var(--color-border)" }}>
          <SectionHeader eyebrow="Setup" title="Bring your history in." detail="Existing data" />
          <div className="space-y-3">
            {needsStravaImport ? (
              <div className="flex items-center justify-between gap-3 rounded-[22px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.012)" }}>
                <div>
                  <div style={{ fontSize: "1.02rem", letterSpacing: "-0.02em" }}>Import Strava archive</div>
                  <div style={{ marginTop: "0.25rem", color: "var(--color-text-dim)", fontSize: "0.92rem" }}>
                    {hasStravaCredentials ? "Pull your existing activities into Alpaca." : "Add Strava credentials in Settings first."}
                  </div>
                </div>
                <button
                  onClick={hasStravaCredentials ? onImportStrava : onOpenSettings}
                  className="rounded-full border px-4 py-2.5"
                  style={{ borderColor: hasStravaCredentials ? "rgba(90,230,222,0.28)" : "var(--color-border)", color: hasStravaCredentials ? "var(--color-accent)" : "var(--color-text-soft)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}
                >
                  {hasStravaCredentials ? "Import" : "Settings"}
                </button>
              </div>
            ) : null}

            {needsBodyRefresh ? (
              <div className="flex items-center justify-between gap-3 rounded-[22px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.012)" }}>
                <div>
                  <div style={{ fontSize: "1.02rem", letterSpacing: "-0.02em" }}>Refresh Oura body context</div>
                  <div style={{ marginTop: "0.25rem", color: "var(--color-text-dim)", fontSize: "0.92rem" }}>
                    {hasOuraToken ? "Pull sleep, readiness, HRV, and resting heart rate." : "Add your Oura token in Settings first."}
                  </div>
                </div>
                <button
                  onClick={hasOuraToken ? onRefreshBody : onOpenSettings}
                  className="rounded-full border px-4 py-2.5"
                  style={{ borderColor: hasOuraToken ? "rgba(90,230,222,0.28)" : "var(--color-border)", color: hasOuraToken ? "var(--color-accent)" : "var(--color-text-soft)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}
                >
                  {hasOuraToken ? "Refresh" : "Settings"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-0 border-t lg:grid-cols-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="border-b px-0 py-7 lg:border-b-0 lg:border-r lg:pr-8" style={{ borderColor: "var(--color-border)" }}>
          <SectionHeader eyebrow="Fig 0.1" title={body ? "Recovery context" : "Body context unavailable"} detail={body?.status === "ready" ? "Updated" : body?.status ?? "Missing"} />
          {body ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}>Sleep</div>
                <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "2.3rem", letterSpacing: "-0.03em" }}>{body.sleep_score ?? "--"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}>Readiness</div>
                <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "2.3rem", letterSpacing: "-0.03em" }}>{body.readiness_score ?? "--"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}>HRV</div>
                <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "1.5rem", letterSpacing: "-0.02em" }}>{body.hrv ?? "--"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}>RHR</div>
                <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "1.5rem", letterSpacing: "-0.02em" }}>{body.rhr ?? "--"}</div>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--color-text-dim)" }}>Add your Oura token in Settings, or authorize Apple Health fallback on iPhone.</div>
          )}
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--color-border)", color: "var(--color-text-soft)" }}>
            Total sleep {formatBodyDuration(body?.total_sleep ?? null)}
          </div>
        </div>

        <div className="border-b py-7 lg:border-b-0 lg:border-r lg:px-8" style={{ borderColor: "var(--color-border)" }}>
          <SectionHeader eyebrow="Fig 0.2" title="This Week" detail={`${allActivities.length} activities`} />
          <div className="mt-4 flex items-end gap-3">
            {load.map((item) => (
              <div key={item.day} className="flex-1">
                <div style={{ height: `${Math.max(14, (item.minutes / maxLoad) * 124)}px`, borderRadius: "999px", background: item.minutes > 0 ? "rgba(90,230,222,0.95)" : "rgba(255,255,255,0.05)" }} />
                <div className="mt-2 text-center" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
            <div style={{ color: "var(--color-text-dim)" }}>Total</div>
            <div className="tabular-nums" style={{ fontSize: "1.25rem" }}>{formatDuration(load.reduce((sum, item) => sum + item.minutes * 60, 0))}</div>
          </div>
        </div>

        <div className="py-7 lg:pl-8">
          <SectionHeader eyebrow="Fig 0.3" title={latest?.comment_headline || "Coach note"} detail={latest?.comment_status === "ready" ? "Ready" : "Pending"} />
          <div style={{ maxWidth: "22rem", color: "var(--color-text-soft)", lineHeight: 1.58 }}>
            {latest?.comment_preview || "GPT-5.4 commentary will sit here after save, with restrained notes about the session, load, and body context."}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <span aria-hidden="true" style={{ width: "0.46rem", height: "0.46rem", borderRadius: "999px", background: "var(--color-accent)" }} />
            <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.72rem" }}>
              Turquoise appears only where the system is live.
            </span>
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
