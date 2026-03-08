import type { ActivitySummary } from "../../types";
import { formatClock } from "../../lib/time";
import { formatDistance, formatDuration, formatPace, formatSpeed } from "../../lib/utils/format";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { SectionHeader } from "../../ui/SectionHeader";
import { StatusChip } from "../../ui/StatusChip";
import { StaticMap } from "../../ui/StaticMap";

interface RunBikeScreenProps {
  activities: ActivitySummary[];
  mapboxToken: string;
  refreshing: boolean;
  syncingHistory: boolean;
  onRefresh: () => void;
  onOpenDetail: (id: string) => void;
  onOpenRecorder: () => void;
}

export function RunBikeScreen({ activities, mapboxToken, refreshing, syncingHistory, onRefresh, onOpenDetail, onOpenRecorder }: RunBikeScreenProps) {
  const latest = activities.find((activity) => activity.type === "Run" || activity.type === "Ride") ?? activities[0];

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing || syncingHistory} label={syncingHistory ? "Syncing history" : "Refresh"}>
      {!latest ? (
        <EmptyState
          title={syncingHistory ? "Bringing your motion history in." : "Run and bike, without the clutter."}
          detail={syncingHistory ? "Alpaca is quietly pulling your existing Strava sessions into the library." : "Press record and the app will keep GPS, COROS heart rate, and the save path tight."}
          actionLabel={syncingHistory ? undefined : "Record"}
          onAction={syncingHistory ? undefined : onOpenRecorder}
        />
      ) : (
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          <section className="border-b py-8" style={{ borderColor: "var(--color-border)" }}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <SectionHeader eyebrow="Run + Bike" title={latest.name} detail={formatClock(latest.start_date_local)} />
              <button onClick={onOpenRecorder}>
                <StatusChip label="Record" tone="accent" />
              </button>
            </div>

            <button onClick={() => onOpenDetail(latest.id)} className="w-full text-left">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5" style={{ borderColor: "var(--color-border)" }}>
                <div>
                  <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.7rem" }}>Distance</div>
                  <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "3.2rem", lineHeight: 0.92, letterSpacing: "-0.04em" }}>{formatDistance(latest.distance)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.7rem" }}>{latest.type === "Ride" ? "Speed" : "Pace"}</div>
                  <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "3.2rem", lineHeight: 0.92, letterSpacing: "-0.04em" }}>
                    {latest.type === "Ride" ? formatSpeed(latest.average_speed) : formatPace(latest.average_speed)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.7rem" }}>Heart</div>
                  <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "1.8rem", color: latest.average_heartrate ? "var(--color-accent)" : "var(--color-text-soft)" }}>
                    {latest.average_heartrate ? Math.round(latest.average_heartrate) : "--"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.7rem" }}>Time</div>
                  <div className="tabular-nums" style={{ marginTop: "0.45rem", fontSize: "1.8rem" }}>{formatDuration(latest.moving_time)}</div>
                </div>
              </div>

              <div className="mt-6">
                <StaticMap polyline={latest.summary_polyline} token={mapboxToken} height={180} />
              </div>
            </button>
          </section>

          <section className="py-7">
            <SectionHeader eyebrow="Signal" title={syncingHistory ? "History is still syncing." : "System is ready."} detail={latest.source === "strava" ? "Imported" : "Live"} />
            <div style={{ maxWidth: "22rem", color: "var(--color-text-soft)", lineHeight: 1.6 }}>
              {syncingHistory
                ? "Strava history is being folded into Alpaca in the background while the phone stays usable."
                : "Turquoise only appears where the app is active: live heart rate, recording, and current system state."}
            </div>
          </section>
        </div>
      )}
    </PullToRefresh>
  );
}
