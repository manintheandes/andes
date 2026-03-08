import type { BodySnapshot } from "../../types";
import { formatBodyDuration } from "../../lib/utils/format";
import { EmptyState } from "../../ui/EmptyState";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { StatusChip } from "../../ui/StatusChip";
import { SurfaceCard } from "../../ui/SurfaceCard";

interface SleepScreenProps {
  body: BodySnapshot | null;
  refreshing: boolean;
  syncing: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
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
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          fontSize: "0.68rem",
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums mt-3"
        style={{
          fontSize: "1.3rem",
          lineHeight: 0.94,
          color: accent ? "var(--color-accent)" : "var(--color-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function SleepScreen({ body, refreshing, syncing, onRefresh, onOpenSettings }: SleepScreenProps) {
  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing || syncing}>
      {!body ? (
        <EmptyState
          title="Recovery is waiting."
          detail="Open System once to add Oura, and the app will keep sleep, readiness, HRV, and resting heart rate attached to each day."
          actionLabel="Open System"
          onAction={onOpenSettings}
        />
      ) : (
        <div className="space-y-5 pt-2">
          <SurfaceCard
            className="px-5 py-5"
            style={{
              background: "transparent",
              borderColor: "var(--color-border-strong)",
            }}
          >
            <div className="mb-5 flex items-start justify-end">
              <StatusChip label={body.status === "ready" ? "live" : body.status.replace("_", " ")} tone={body.status === "ready" ? "accent" : "neutral"} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[28px] border px-5 py-5"
                style={{
                  borderColor: "var(--color-border)",
                  background: "rgba(255,255,255,0.012)",
                }}
              >
                <div
                  style={{
                    color: "var(--color-text-dim)",
                    fontFamily: "var(--font-sharp)",
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    fontSize: "0.68rem",
                  }}
                >
                  sleep
                </div>
                <div className="tabular-nums" style={{ marginTop: "0.8rem", fontSize: "3.3rem", lineHeight: 0.9, letterSpacing: "-0.05em" }}>
                  {body.sleep_score ?? "--"}
                </div>
              </div>

              <div
                className="rounded-[28px] border px-5 py-5"
                style={{
                  borderColor: "var(--color-border)",
                  background: "rgba(255,255,255,0.012)",
                }}
              >
                <div
                  style={{
                    color: "var(--color-text-dim)",
                    fontFamily: "var(--font-sharp)",
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    fontSize: "0.68rem",
                  }}
                >
                  ready
                </div>
                <div className="tabular-nums" style={{ marginTop: "0.8rem", fontSize: "3.3rem", lineHeight: 0.9, letterSpacing: "-0.05em" }}>
                  {body.readiness_score ?? "--"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <StatTile label="night" value={formatBodyDuration(body.total_sleep ?? null)} />
              <StatTile label="HRV" value={body.hrv ?? "--"} accent={Boolean(body.hrv)} />
              <StatTile label="RHR" value={body.rhr ?? "--"} />
            </div>
          </SurfaceCard>
        </div>
      )}
    </PullToRefresh>
  );
}
