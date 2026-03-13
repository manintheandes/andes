import { useMemo } from "react";
import type { ActivityDetail, ActivitySummary } from "../../types";
import { formatClock, formatDateFull } from "../../lib/time";
import { haversine } from "../../lib/utils/geo";
import { formatDistance, formatDuration, formatElevation, formatPace, formatSpeed } from "../../lib/utils/format";
import { buildGpx, downloadGpx, gpxFilename } from "../../lib/utils/gpx";
import { CoachCard } from "../coach/CoachCard";
import { SectionHeader } from "../../ui/SectionHeader";
import { AreaChart } from "../../ui/AreaChart";
import { StaticMap } from "../../ui/StaticMap";

import { BackIcon, CloseIcon, CoachIcon, ExportIcon, SleepIcon, TrailDivider } from "../home/HomeScreen";

interface ActivityDetailSheetProps {
  summary: ActivitySummary;
  detail: ActivityDetail | null;
  mapboxToken: string;
  onClose: () => void;
  onGoHome: () => void;
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
    <div className="px-4 py-4">
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

/** Downsample an array to roughly `target` points for chart rendering. */
function downsample(data: number[], target: number): number[] {
  if (data.length <= target) return data;
  const step = data.length / target;
  const result: number[] = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    result.push(sum / (end - start));
  }
  return result;
}

export function ActivityDetailSheet({ summary, detail, mapboxToken, onClose, onGoHome, onGenerateComment, onDelete }: ActivityDetailSheetProps) {
  const hrData = useMemo(
    () => detail?.points.map((point) => point.hr).filter((value): value is number => typeof value === "number") ?? [],
    [detail?.points],
  );

  const paceData = useMemo(() => {
    if (!detail?.points.length || detail.points.length < 2) return [];
    return detail.points.slice(1).map((point, index) => {
      const previous = detail.points[index];
      const seconds = Math.max(1, (point.time - previous.time) / 1000);
      const meters = haversine(previous.lat, previous.lng, point.lat, point.lng);
      return meters / seconds;
    });
  }, [detail?.points]);

  const elevationData = useMemo(
    () => detail?.points.map((point) => point.alt).filter((value) => typeof value === "number" && Number.isFinite(value)) ?? [],
    [detail?.points],
  );

  const paceForChart = useMemo(() => {
    if (paceData.length < 2) return [];
    return downsample(paceData.filter((v) => v > 0.3 && v < 15), 200);
  }, [paceData]);

  const hrForChart = useMemo(() => downsample(hrData, 200), [hrData]);
  const elevForChart = useMemo(() => downsample(elevationData, 200), [elevationData]);

  const isRide = summary.type === "Ride";
  const showSplits = Boolean(detail?.splits.length);
  const showBody = hasBodySnapshot(detail);
  const showHeartRate = hrForChart.length > 1;
  const showPace = paceForChart.length > 1;
  const showElevation = elevForChart.length > 1 && Math.max(...elevForChart) - Math.min(...elevForChart) > 1;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--color-bg)", overscrollBehavior: "contain" }}>
      <div className="mx-auto max-w-[28rem] px-5 pb-6 pt-4">
        <div className="mb-6">
          <button onClick={onClose} className="transition-opacity active:opacity-50" aria-label="Back">
            <BackIcon size={24} />
          </button>
        </div>

        <div className="space-y-5">
          <section className="space-y-5">
            <div>
              <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {formatDateFull(summary.start_date_local)} · {formatClock(summary.start_date_local)}
              </div>
              <div style={{ marginTop: "0.8rem", fontSize: "clamp(2.4rem, 10vw, 3.7rem)", lineHeight: 0.94, letterSpacing: "-0.045em" }}>
                {summary.name}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between px-1 py-4">
                <div className="tabular-nums" style={{ fontSize: "3.4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
                  {formatDistance(summary.distance)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>mi</div>
              </div>
              <TrailDivider variant="contour" />
              <div className="flex items-baseline justify-between px-1 py-4">
                <div className="tabular-nums" style={{ fontSize: "3.4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
                  {formatDuration(summary.moving_time)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>time</div>
              </div>
              <TrailDivider variant="contour" />
              <div className="flex items-baseline justify-between px-1 py-4">
                <div className="tabular-nums" style={{ fontSize: "3.4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
                  {summary.average_speed > 0
                    ? summary.type === "Ride" ? formatSpeed(summary.average_speed) : formatPace(summary.average_speed)
                    : "--"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{summary.type === "Ride" ? "mph" : "/mi"}</div>
              </div>
              <TrailDivider variant="contour" />
              <div className="flex items-baseline justify-between px-1 py-4">
                <div className="tabular-nums" style={{ fontSize: "3.4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: summary.average_heartrate ? "var(--color-accent)" : "var(--color-text-soft)" }}>
                  {summary.average_heartrate ? Math.round(summary.average_heartrate) : "--"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>bpm</div>
              </div>
              {summary.total_elevation_gain > 0 ? (
                <>
                  <TrailDivider variant="contour" />
                  <div className="flex items-baseline justify-between px-1 py-4">
                    <div className="tabular-nums" style={{ fontSize: "3.4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
                      {formatElevation(summary.total_elevation_gain)}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>ft gain</div>
                  </div>
                </>
              ) : null}
            </div>

            <CoachCard comment={detail?.coachComment ?? null} status={summary.comment_status} onGenerate={onGenerateComment} />

            <div className="overflow-hidden rounded-[28px]">
              <StaticMap token={mapboxToken} polyline={summary.summary_polyline} points={detail?.points} />
            </div>
          </section>

          {showSplits ? (
            <section className="space-y-4">
              <SectionHeader eyebrow={`${detail?.splits.length ?? 0} splits`} />
              <div className="space-y-0">
                <div className="flex items-center justify-between px-4 pb-2" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.64rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  <span style={{ width: "2rem" }}>mi</span>
                  <span style={{ flex: 1, textAlign: "center" }}>pace</span>
                  <span style={{ width: "3.5rem", textAlign: "right" }}>hr</span>
                </div>
                {detail?.splits.map((split, index) => {
                  const splitPace = split.distance > 0 ? split.time / (split.distance / 1609.34) : 0;
                  const paceStr = splitPace > 0 ? formatDuration(Math.round(splitPace)) : "--";
                  return (
                    <div
                      key={`${split.endIdx}-${index}`}
                      className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: index < (detail?.splits.length ?? 0) - 1 ? "1px solid var(--color-border)" : "none" }}
                    >
                      <span className="tabular-nums" style={{ color: "var(--color-text-dim)", width: "2rem" }}>{index + 1}</span>
                      <span className="tabular-nums" style={{ flex: 1, textAlign: "center" }}>{paceStr}</span>
                      <span className="tabular-nums" style={{ color: split.avgHR ? "var(--color-accent)" : "var(--color-text-soft)", width: "3.5rem", textAlign: "right" }}>
                        {split.avgHR ? Math.round(split.avgHR) : "--"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Elevation profile */}
          {showElevation ? (
            <section className="space-y-4">
              <SectionHeader eyebrow="elevation" />
              <div className="px-1 py-2">
                <AreaChart
                  data={elevForChart}
                  height={80}
                  color="rgba(245,247,248,0.50)"
                  fillOpacity={0.08}
                  unit="ft"
                  showRange
                />
              </div>
            </section>
          ) : null}

          {/* Heart rate chart */}
          {showHeartRate ? (
            <section className="space-y-4">
              <SectionHeader eyebrow="heart rate" />
              <div className="px-1 py-2">
                <AreaChart
                  data={hrForChart}
                  height={80}
                  color="var(--color-accent)"
                  fillOpacity={0.10}
                  unit="bpm"
                  showRange
                />
              </div>
              {summary.max_heartrate ? (
                <div className="flex items-center justify-between px-1">
                  <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>max</span>
                  <span className="tabular-nums" style={{ color: "var(--color-accent)", fontSize: "0.88rem" }}>{Math.round(summary.max_heartrate)} bpm</span>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Pace / Speed chart */}
          {showPace ? (
            <section className="space-y-4">
              <SectionHeader eyebrow={isRide ? "speed" : "pace"} />
              <div className="px-1 py-2">
                <AreaChart
                  data={paceForChart}
                  height={72}
                  color="rgba(245,247,248,0.60)"
                  fillOpacity={0.06}
                  unit={isRide ? "mph" : "m/s"}
                  showRange
                />
              </div>
            </section>
          ) : null}

          {/* Body context */}
          {showBody ? (
            <section className="space-y-4">
              <SectionHeader icon={<SleepIcon size={14} />} eyebrow="body context" />
              <div>
                <div className="flex items-baseline justify-between px-1 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>sleep</span>
                  <span className="tabular-nums" style={{ fontSize: "1.5rem", letterSpacing: "-0.03em" }}>{detail?.bodySnapshot?.sleep_score ?? "--"}</span>
                </div>
                <div className="flex items-baseline justify-between px-1 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>readiness</span>
                  <span className="tabular-nums" style={{ fontSize: "1.5rem", letterSpacing: "-0.03em" }}>{detail?.bodySnapshot?.readiness_score ?? "--"}</span>
                </div>
                <div className="flex items-baseline justify-between px-1 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>hrv</span>
                  <span className="tabular-nums" style={{ fontSize: "1.5rem", letterSpacing: "-0.03em", color: detail?.bodySnapshot?.hrv ? "var(--color-accent)" : "var(--color-text-soft)" }}>
                    {detail?.bodySnapshot?.hrv != null ? `${detail.bodySnapshot.hrv} ms` : "--"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between px-1 py-3">
                  <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>resting hr</span>
                  <span className="tabular-nums" style={{ fontSize: "1.5rem", letterSpacing: "-0.03em" }}>
                    {detail?.bodySnapshot?.rhr != null ? `${detail.bodySnapshot.rhr} bpm` : "--"}
                  </span>
                </div>
              </div>
              {detail?.bodySnapshot?.total_sleep ? (
                <div className="px-1" style={{ color: "var(--color-text-dim)", fontSize: "0.88rem" }}>
                  Total sleep: {formatDuration(detail.bodySnapshot.total_sleep)}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Secondary metrics */}
          {(summary.calories || summary.average_cadence || summary.max_speed > 0) ? (
            <section className="space-y-4">
              <SectionHeader eyebrow="details" />
              <div>
                {summary.calories ? (
                  <div className="flex items-center justify-between px-1 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <span style={{ color: "var(--color-text-dim)", fontSize: "0.92rem" }}>Calories</span>
                    <span className="tabular-nums">{Math.round(summary.calories)} kcal</span>
                  </div>
                ) : null}
                {summary.average_cadence ? (
                  <div className="flex items-center justify-between px-1 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <span style={{ color: "var(--color-text-dim)", fontSize: "0.92rem" }}>Cadence</span>
                    <span className="tabular-nums">{Math.round(summary.average_cadence)} spm</span>
                  </div>
                ) : null}
                {summary.max_speed > 0 ? (
                  <div className="flex items-center justify-between px-1 py-2.5">
                    <span style={{ color: "var(--color-text-dim)", fontSize: "0.92rem" }}>Max {isRide ? "speed" : "pace"}</span>
                    <span className="tabular-nums">
                      {isRide ? `${formatSpeed(summary.max_speed)} mph` : `${formatPace(summary.max_speed)} /mi`}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {detail && detail.points.length > 1 ? (
            <section className="pt-2">
              <button
                onClick={() => {
                  const xml = buildGpx(summary, detail.points);
                  downloadGpx(xml, gpxFilename(summary));
                }}
                className="flex w-full items-center justify-center gap-3 rounded-[22px] px-5 py-4 transition-opacity active:opacity-50"
                style={{
                  border: "1px solid rgba(90,230,222,0.24)",
                  background: "transparent",
                }}
                aria-label="Export GPX"
              >
                <ExportIcon size={18} />
                <span style={{ color: "var(--color-text-dim)", fontSize: "0.78rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Export GPX</span>
              </button>
            </section>
          ) : null}

          <section className="pt-2">
            <button
              onClick={onDelete}
              className="flex w-full items-center justify-center rounded-[22px] px-5 py-4"
              style={{
                border: "1px solid rgba(90,230,222,0.24)",
                background: "transparent",
              }}
              aria-label="Delete activity"
            >
              <CloseIcon size={18} />
            </button>
          </section>

          <div className="pt-4">
            <button
              onClick={onGoHome}
              className="transition-opacity active:opacity-50"
              aria-label="Home"
            >
              <CoachIcon size={36} color="rgba(90,230,222,0.5)" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
