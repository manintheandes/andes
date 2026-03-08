import type { ReactNode } from "react";

interface PullToRefreshProps {
  label?: string;
  onRefresh: () => void;
  refreshing?: boolean;
  showControl?: boolean;
  children: ReactNode;
}

export function PullToRefresh({ label = "Refresh", onRefresh, refreshing = false, showControl = false, children }: PullToRefreshProps) {
  return (
    <div>
      {showControl || refreshing ? (
        <div className="mb-4 flex justify-end">
          {showControl ? (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2"
              style={{
                color: refreshing ? "var(--color-accent)" : "var(--color-text-dim)",
                fontFamily: "var(--font-sharp)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontSize: "0.72rem",
              }}
            >
              <span aria-hidden="true" style={{ width: "0.38rem", height: "0.38rem", borderRadius: "999px", background: refreshing ? "var(--color-accent)" : "rgba(255,255,255,0.18)" }} />
              {refreshing ? "Refreshing" : label}
            </button>
          ) : (
            <div
              className="inline-flex items-center gap-2"
              style={{
                color: "var(--color-text-dim)",
                fontFamily: "var(--font-sharp)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontSize: "0.72rem",
              }}
            >
              <span aria-hidden="true" style={{ width: "0.38rem", height: "0.38rem", borderRadius: "999px", background: "var(--color-accent)" }} />
              {label}
            </div>
          )}
        </div>
      ) : null}
      {children}
    </div>
  );
}
