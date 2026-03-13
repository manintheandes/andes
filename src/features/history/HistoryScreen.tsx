import { useMemo, useState } from "react";
import type { ActivitySummary, BodySnapshot, SportType } from "../../types";
import { daysAgoKey } from "../../lib/time";
import { formatDistance, formatDuration, formatElevation } from "../../lib/utils/format";
import { computeRecords, type PersonalRecord } from "../../lib/utils/records";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { SectionHeader } from "../../ui/SectionHeader";
import { AlpacaIcon, RideIcon, WalkIcon, YogaIcon, HikeIcon, SettingsIcon, SleepIcon, TrailDivider } from "../home/HomeScreen";

interface HistoryScreenProps {
  activities: ActivitySummary[];
  body: BodySnapshot | null;
  currentPromptVersion: string;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenDetail: (id: string) => void;
  onOpenSettings: () => void;
}

const FILTERS: Array<"All" | SportType> = ["All", "Run", "Ride", "Walk", "Hike", "Yoga"];

const FILTER_ICONS: Record<string, React.ReactNode> = {
  All: <AlpacaIcon size={16} />,
  Run: <AlpacaIcon size={16} />,
  Ride: <RideIcon size={16} />,
  Walk: <WalkIcon size={16} />,
  Yoga: <YogaIcon size={16} />,
  Hike: <HikeIcon size={16} />,
};

interface PeriodStats {
  count: number;
  distance: number;
  time: number;
  elevation: number;
  avgHR: number | null;
}

function computeStats(activities: ActivitySummary[]): PeriodStats {
  const count = activities.length;
  const distance = activities.reduce((s, a) => s + a.distance, 0);
  const time = activities.reduce((s, a) => s + a.moving_time, 0);
  const elevation = activities.reduce((s, a) => s + a.total_elevation_gain, 0);
  const hrActivities = activities.filter((a) => a.average_heartrate);
  const avgHR = hrActivities.length > 0
    ? hrActivities.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / hrActivities.length
    : null;
  return { count, distance, time, elevation, avgHR };
}

function StatBlock({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="py-3">
      <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.64rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="tabular-nums mt-1.5 flex items-baseline gap-1.5">
        <span style={{ fontSize: "1.6rem", letterSpacing: "-0.03em", lineHeight: 0.95, color: accent ? "var(--color-accent)" : undefined }}>{value}</span>
        {unit ? <span style={{ fontSize: "0.68rem", color: "var(--color-text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{unit}</span> : null}
      </div>
    </div>
  );
}

function WeekBar({ activities }: { activities: ActivitySummary[] }) {
  const bars = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = daysAgoKey(6 - index);
      const dayActivities = activities.filter((a) => a.start_date_local.startsWith(day));
      const minutes = dayActivities.reduce((s, a) => s + a.moving_time / 60, 0);
      const label = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" });
      return { day, minutes, label };
    });
  }, [activities]);

  const max = Math.max(...bars.map((b) => b.minutes), 20);

  return (
    <div className="flex items-end gap-2">
      {bars.map((bar) => (
        <div key={bar.day} className="flex-1 text-center">
          <div
            style={{
              height: `${Math.max(4, (bar.minutes / max) * 48)}px`,
              borderRadius: "999px",
              background: bar.minutes > 0 ? "var(--color-accent)" : "rgba(255,255,255,0.04)",
              opacity: bar.minutes > 0 ? 0.85 : 1,
              transition: "height 200ms ease",
            }}
          />
          <div className="mt-1.5" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {bar.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordRow({ record, onTap }: { record: PersonalRecord; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full text-left py-3 transition-opacity active:opacity-50"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase", minWidth: "5rem" }}>
          {record.label}
        </div>
        <div className="tabular-nums flex items-baseline gap-1" style={{ fontSize: "1.3rem", letterSpacing: "-0.03em", lineHeight: 0.95 }}>
          {record.value}
          <span style={{ fontFamily: "var(--font-sharp)", fontSize: "0.58rem", color: "var(--color-text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{record.unit}</span>
        </div>
        <span style={{ color: "var(--color-text-dim)", fontSize: "0.72rem", minWidth: "3rem", textAlign: "right" }}>
          {new Date(record.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
        </span>
      </div>
    </button>
  );
}

export function HistoryScreen({ activities, body, currentPromptVersion, refreshing, onRefresh, onOpenDetail, onOpenSettings }: HistoryScreenProps) {
  const [filter, setFilter] = useState<"All" | SportType>("All");
  const [showRecords, setShowRecords] = useState(false);
  const records = useMemo(() => computeRecords(activities), [activities]);

  const filtered = useMemo(
    () => filter === "All" ? activities : activities.filter((a) => a.type === filter),
    [activities, filter],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, ActivitySummary[]>();
    filtered.forEach((activity) => {
      const month = new Date(activity.start_date_local).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
      groups.set(month, [...(groups.get(month) ?? []), activity]);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  // Weekly stats (last 7 days)
  const weekStats = useMemo(() => {
    const cutoff = daysAgoKey(6);
    const weekActivities = filtered.filter((a) => a.start_date_local.slice(0, 10) >= cutoff);
    return computeStats(weekActivities);
  }, [filtered]);

  // All-time stats for current filter
  const totalStats = useMemo(() => computeStats(filtered), [filtered]);

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing}>
      {activities.length === 0 ? (
        <EmptyState
          title="No activities yet."
          actionIcon={<SettingsIcon size={18} />}
          onAction={onOpenSettings}
          actionLabel="Open settings"
        />
      ) : (
        <>
          {/* Summary stats */}
          <section className="mb-6">
            <div className="mb-4">
              <WeekBar activities={activities} />
            </div>

            <div className="grid grid-cols-2 gap-x-6">
              <StatBlock label="this week" value={formatDistance(weekStats.distance)} unit="mi" />
              <StatBlock label="time" value={formatDuration(weekStats.time)} />
              {weekStats.elevation > 0 ? (
                <StatBlock label="elevation" value={formatElevation(weekStats.elevation)} unit="ft" />
              ) : null}
              {weekStats.avgHR ? (
                <StatBlock label="avg hr" value={String(Math.round(weekStats.avgHR))} unit="bpm" accent />
              ) : null}
            </div>

            {/* Body context (HRV + RHR) inline */}
            {body && (body.hrv || body.rhr) ? (
              <div className="mt-2 grid grid-cols-2 gap-x-6">
                {body.hrv ? <StatBlock label="hrv" value={String(body.hrv)} unit="ms" accent /> : null}
                {body.rhr ? <StatBlock label="resting hr" value={String(body.rhr)} unit="bpm" /> : null}
              </div>
            ) : null}
          </section>

          {/* Personal Records */}
          {records.length > 0 ? (
            <section className="mb-4">
              <button
                onClick={() => setShowRecords(!showRecords)}
                className="w-full text-left transition-opacity active:opacity-50"
              >
                <SectionHeader eyebrow="Personal Records" detail={showRecords ? `${records.length}` : "Tap to view"} />
              </button>
              {showRecords ? (
                <div className="andes-slide-up">
                  {records.map((record) => (
                    <RecordRow key={record.label} record={record} onTap={() => onOpenDetail(record.activityId)} />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <TrailDivider variant="strata" />

          {/* Filter pills */}
          <div
            className="my-6 flex gap-3 overflow-x-auto px-1 py-2"
            style={{ scrollbarWidth: "none" }}
          >
            {FILTERS.map((item) => {
              const active = item === filter;
              return (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{
                    width: 40,
                    height: 40,
                    background: active ? "var(--color-accent)" : "transparent",
                    border: active ? "1px solid rgba(90,230,222,0.82)" : "1px solid transparent",
                    opacity: active ? 1 : 0.5,
                  }}
                  aria-label={item}
                >
                  {active ? (
                    <span style={{ filter: "brightness(0)" }}>{FILTER_ICONS[item]}</span>
                  ) : (
                    FILTER_ICONS[item]
                  )}
                </button>
              );
            })}
          </div>

          {/* Totals for current filter */}
          {filter !== "All" ? (
            <div className="mb-4 grid grid-cols-3 gap-x-4">
              <StatBlock label="total" value={formatDistance(totalStats.distance)} unit="mi" />
              <StatBlock label="time" value={formatDuration(totalStats.time)} />
              <StatBlock label="count" value={String(totalStats.count)} />
            </div>
          ) : null}

          {/* Activity list */}
          {grouped.map(([month, monthActivities]) => {
            const monthStats = computeStats(monthActivities);
            const detail = [
              `${monthActivities.length}`,
              formatDistance(monthStats.distance) + " mi",
              monthStats.elevation > 0 ? formatElevation(monthStats.elevation) + " ft" : null,
            ].filter(Boolean).join(" · ");

            return (
              <div key={month} className="mb-6">
                <SectionHeader eyebrow={month} detail={detail} />
                <div>
                  {monthActivities.map((activity, index) => (
                    <button
                      key={activity.id}
                      onClick={() => onOpenDetail(activity.id)}
                      className="w-full py-3.5 text-left"
                      style={{ borderBottom: index === monthActivities.length - 1 ? "none" : "1px solid var(--color-border)" }}
                    >
                      <div className="flex items-start justify-between gap-5">
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="truncate" style={{ fontSize: "1.24rem", lineHeight: 0.98, letterSpacing: "-0.03em" }}>
                            {activity.name}
                          </div>
                          <div
                            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                            style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase" }}
                          >
                            <span>{new Date(activity.start_date_local).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            {activity.total_elevation_gain > 0 ? (
                              <span>{formatElevation(activity.total_elevation_gain)} ft</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="min-w-[7.5rem] text-right">
                          <div className="tabular-nums" style={{ fontSize: "1.5rem", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
                            {formatDistance(activity.distance)}
                          </div>
                          <div className="tabular-nums mt-2" style={{ color: "var(--color-text-soft)", fontSize: "0.98rem" }}>
                            {formatDuration(activity.moving_time)}
                          </div>
                          {activity.average_heartrate ? (
                            <div className="mt-2 flex items-center justify-end gap-1.5">
                              <span className="tabular-nums" style={{ color: "var(--color-accent)", fontFamily: "var(--font-sharp)", fontSize: "0.7rem", letterSpacing: "0.12em" }}>
                                {Math.round(activity.average_heartrate)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </PullToRefresh>
  );
}
