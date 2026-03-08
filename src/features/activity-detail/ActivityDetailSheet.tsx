import type { ActivityDetail, ActivitySummary } from "../../types";
import { formatClock, formatDateFull } from "../../lib/time";
import { haversine } from "../../lib/utils/geo";
import { formatDistance, formatDuration, formatElevation, formatPace, formatSpeed } from "../../lib/utils/format";
import { CoachCard } from "../coach/CoachCard";
import { SectionHeader } from "../../ui/SectionHeader";
import { Sparkline } from "../../ui/Sparkline";
import { StaticMap } from "../../ui/StaticMap";
import { StatusChip } from "../../ui/StatusChip";
import { SurfaceCard } from "../../ui/SurfaceCard";
import { BackIcon, CloseIcon } from "../home/HomeScreen";

interface ActivityDetailSheetProps {
  summary: ActivitySummary;
  detail: ActivityDetail | null;
  mapboxToken: string;
  onClose: () => void;
  onGenerateComment: () => void;
  onDelete: () => void;
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-[24px] border px-4 py-4"
      style={{
        borderColor: "var(--color-border)",
        background: "rgba(255,255,255,0.012)",
      }}
    >
      <div
        style={{
          color: "var(--color-text-dim)",
          fontFamily: "var(--font-sharp)",
          fontSize: "0.68rem",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </div>
      <div className="tabular-nums mt-3" style={{ fontSize: "1.7rem", lineHeight: 0.92, letterSpacing: "-0.03em" }}>
        {value}
      </div>
    </div>
  );
}

function hasBodySnapshot(detail: ActivityDetail | null) {
  if (!detail?.bodySnapshot) return false;
  const { sleep_score, readiness_score, hrv, rhr } = detail.bodySnapshot;
  return [sleep_score, readiness_score, hrv, rhr].some((value) => value !== null && value !== undefined);
}

export function ActivityDetailSheet({ summary, detail, mapboxToken, onClose, onGenerateComment, onDelete }: ActivityDetailSheetProps) {
  const hrData = detail?.points.map((point) => point.hr).filter((value): value is number => typeof value === "number") ?? [];
  const paceData =
    detail?.points.length && detail.points.length > 1
      ? detail.points.slice(1).map((point, index) => {
          const previous = detail.points[index];
          const seconds = Math.max(1, (point.time - previous.time) / 1000);
          const meters = haversine(previous.lat, previous.lng, point.lat, point.lng);
          return meters / seconds;
        })
      : [];
  const showSplits = Boolean(detail?.splits.length);
  const showBody = hasBodySnapshot(detail);
  const showHeartRate = hrData.length > 1;
  const showPace = paceData.length > 1;
  const showSensors = Boolean(detail?.sensorTimeline.length);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "rgba(3,4,5,0.992)" }}>
      <div className="mx-auto max-w-[28rem] px-5 pb-10 pt-4">
        <div className="mb-6 flex items-center justify-between">
          <button onClick={onClose} className="transition-opacity active:opacity-50" aria-label="Back">
            <BackIcon size={24} />
          </button>
          <StatusChip
            label={summary.comment_status === "ready" ? "Ready" : summary.comment_status === "pending" ? "Writing" : summary.save_status}
            tone={summary.comment_status === "ready" ? "accent" : "neutral"}
          />
        </div>

        <div className="space-y-7">
          <section className="space-y-5">
            <div>
              <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {formatDateFull(summary.start_date_local)} · {formatClock(summary.start_date_local)}
              </div>
              <div style={{ marginTop: "0.8rem", fontSize: "clamp(2.4rem, 10vw, 3.7rem)", lineHeight: 0.94, letterSpacing: "-0.045em" }}>
                {summary.name}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailMetric label="mi" value={formatDistance(summary.distance)} />
              <DetailMetric label={summary.type === "Ride" ? "mph" : "/mi"} value={summary.type === "Ride" ? formatSpeed(summary.average_speed) : formatPace(summary.average_speed)} />
              <DetailMetric label="time" value={formatDuration(summary.moving_time)} />
              <DetailMetric label="ft" value={formatElevation(summary.total_elevation_gain)} />
            </div>

            <SurfaceCard
              className="overflow-hidden"
              style={{
                background: "transparent",
                borderColor: "var(--color-border)",
              }}
            >
              <StaticMap token={mapboxToken} polyline={summary.summary_polyline} points={detail?.points} />
            </SurfaceCard>
          </section>

          {showSplits ? (
            <section className="space-y-4">
              <SectionHeader eyebrow={`${detail?.splits.length ?? 0} mi`} />
              <div className="space-y-2">
                {detail?.splits.map((split, index) => (
                  <SurfaceCard
                    key={`${split.endIdx}-${index}`}
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      background: "rgba(255,255,255,0.012)",
                    }}
                  >
                    <span className="tabular-nums" style={{ color: "var(--color-text-dim)" }}>{index + 1}</span>
                    <span className="tabular-nums">{formatDuration(split.time)}</span>
                    <span className="tabular-nums" style={{ color: split.avgHR ? "var(--color-accent)" : "var(--color-text-soft)" }}>
                      {split.avgHR ? Math.round(split.avgHR) : "--"}
                    </span>
                  </SurfaceCard>
                ))}
              </div>
            </section>
          ) : null}

          {showBody ? (
            <section className="space-y-4">
              <SectionHeader eyebrow={detail?.bodySnapshot?.status ?? "body"} />
              <div className="grid grid-cols-2 gap-3">
                <DetailMetric label="sleep" value={String(detail?.bodySnapshot?.sleep_score ?? "--")} />
                <DetailMetric label="ready" value={String(detail?.bodySnapshot?.readiness_score ?? "--")} />
                <DetailMetric label="HRV" value={String(detail?.bodySnapshot?.hrv ?? "--")} />
                <DetailMetric label="RHR" value={String(detail?.bodySnapshot?.rhr ?? "--")} />
              </div>
            </section>
          ) : null}

          {showHeartRate ? (
            <section className="space-y-4">
              <SectionHeader eyebrow="bpm" />
              <SurfaceCard className="px-4 py-4" style={{ background: "transparent" }}>
                <Sparkline data={hrData} />
              </SurfaceCard>
            </section>
          ) : null}

          {showPace ? (
            <section className="space-y-4">
              <SectionHeader eyebrow="/mi" />
              <SurfaceCard className="px-4 py-4" style={{ background: "transparent" }}>
                <Sparkline data={paceData} color="rgba(245,247,248,0.76)" />
              </SurfaceCard>
            </section>
          ) : null}

          {showSensors ? (
            <section className="space-y-4">
              <SectionHeader eyebrow="sensors" />
              <div className="space-y-2">
                {detail?.sensorTimeline.map((event, index) => (
                  <SurfaceCard
                    key={`${event.kind}-${event.at}-${index}`}
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      background: "rgba(255,255,255,0.012)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "0.38rem",
                        height: "0.38rem",
                        borderRadius: "999px",
                        background: event.status === "connected" || event.status === "ready" ? "var(--color-accent)" : "transparent",
                        border: event.status === "connected" || event.status === "ready" ? "none" : "1px solid var(--color-text-dim)",
                      }}
                    />
                    <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>{event.kind}</span>
                  </SurfaceCard>
                ))}
              </div>
            </section>
          ) : null}

          <CoachCard comment={detail?.coachComment ?? null} status={summary.comment_status} onGenerate={onGenerateComment} />

          <section className="pt-2">
            <button
              onClick={onDelete}
              className="flex w-full items-center justify-center rounded-[22px] border px-5 py-4"
              style={{
                borderColor: "rgba(90,230,222,0.24)",
                background: "transparent",
              }}
              aria-label="Delete activity"
            >
              <CloseIcon size={18} />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
