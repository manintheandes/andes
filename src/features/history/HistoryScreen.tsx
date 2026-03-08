import { useMemo, useState } from "react";
import type { ActivitySummary, SportType } from "../../types";
import { formatDistance, formatDuration } from "../../lib/utils/format";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { SectionHeader } from "../../ui/SectionHeader";
import { AlpacaIcon, RideIcon, WalkIcon, YogaIcon, HikeIcon } from "../home/HomeScreen";

interface HistoryScreenProps {
  activities: ActivitySummary[];
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

export function HistoryScreen({ activities, currentPromptVersion, refreshing, onRefresh, onOpenDetail, onOpenSettings }: HistoryScreenProps) {
  const [filter, setFilter] = useState<"All" | SportType>("All");
  const grouped = useMemo(() => {
    const filtered = filter === "All" ? activities : activities.filter((activity) => activity.type === filter);
    const groups = new Map<string, ActivitySummary[]>();
    filtered.forEach((activity) => {
      const month = new Date(activity.start_date_local).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
      groups.set(month, [...(groups.get(month) ?? []), activity]);
    });
    return Array.from(groups.entries());
  }, [activities, filter]);

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing}>
      {activities.length === 0 ? (
        <EmptyState
          title="Nothing in the archive yet."
          detail="Record once and it will land here. If you already have years in Strava, open System and Alpaca will fold them in quietly."
          actionLabel="Open System"
          onAction={onOpenSettings}
        />
      ) : (
        <>
          <div
            className="mb-8 flex gap-3 overflow-x-auto border-y px-1 py-2"
            style={{ borderColor: "var(--color-border)", scrollbarWidth: "none" }}
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

          {grouped.map(([month, monthActivities]) => {
            const totalDistance = monthActivities.reduce((sum, activity) => sum + activity.distance, 0);
            return (
              <div key={month} className="mb-9">
                <SectionHeader eyebrow={month} detail={`${monthActivities.length} · ${formatDistance(totalDistance)}`} />
                <div className="border-y" style={{ borderColor: "var(--color-border)" }}>
                  {monthActivities.map((activity, index) => {
                    const coachReady = activity.comment_status === "ready" && activity.comment_prompt_version === currentPromptVersion;
                    return (
                    <button
                      key={activity.id}
                      onClick={() => onOpenDetail(activity.id)}
                      className="w-full py-5 text-left"
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
                          </div>
                        </div>

                        <div className="min-w-[7.5rem] text-right">
                          <div className="tabular-nums" style={{ fontSize: "1.5rem", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
                            {formatDistance(activity.distance)}
                          </div>
                          <div className="tabular-nums mt-2" style={{ color: "var(--color-text-soft)", fontSize: "0.98rem" }}>
                            {formatDuration(activity.moving_time)}
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-1.5">
                            <span
                              aria-hidden="true"
                              style={{
                                width: "0.38rem",
                                height: "0.38rem",
                                borderRadius: "999px",
                                background: coachReady ? "var(--color-accent)" : "transparent",
                              }}
                            />
                            {activity.average_heartrate ? (
                              <span className="tabular-nums" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sharp)", fontSize: "0.7rem", letterSpacing: "0.12em" }}>
                                {Math.round(activity.average_heartrate)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </PullToRefresh>
  );
}
