import { useMemo } from "react";

interface AreaChartProps {
  data: number[];
  height?: number;
  color?: string;
  fillOpacity?: number;
  label?: string;
  unit?: string;
  showRange?: boolean;
  invert?: boolean;
}

export function AreaChart({
  data,
  height = 72,
  color = "var(--color-accent)",
  fillOpacity = 0.12,
  label,
  unit,
  showRange = true,
  invert = false,
}: AreaChartProps) {
  const stats = useMemo(() => {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const avg = data.reduce((s, v) => s + v, 0) / data.length;
    return { min, max, avg, range: max - min || 1 };
  }, [data]);

  if (!stats) return null;

  const width = 320;
  const padY = 6;
  const chartH = height - padY * 2;

  const points = data.map((value, index) => {
    const x = (index / Math.max(1, data.length - 1)) * width;
    const normalized = (value - stats.min) / stats.range;
    const y = invert
      ? padY + normalized * chartH
      : height - padY - normalized * chartH;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
  const fillPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  // Average line position
  const avgNorm = (stats.avg - stats.min) / stats.range;
  const avgY = invert
    ? padY + avgNorm * chartH
    : height - padY - avgNorm * chartH;

  return (
    <div>
      {(label || showRange) ? (
        <div className="mb-3 flex items-end justify-between">
          {label ? (
            <div
              style={{
                fontFamily: "var(--font-sharp)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontSize: "0.68rem",
                color: "var(--color-text-dim)",
              }}
            >
              {label}
            </div>
          ) : <div />}
          {showRange ? (
            <div className="flex items-center gap-4">
              <span className="tabular-nums" style={{ fontSize: "0.78rem", color: "var(--color-text-dim)" }}>
                {Math.round(stats.min)}{unit ? ` ${unit}` : ""}
              </span>
              <span className="tabular-nums" style={{ fontSize: "0.88rem", color }}>
                {Math.round(stats.avg)}{unit ? ` ${unit}` : ""}
              </span>
              <span className="tabular-nums" style={{ fontSize: "0.78rem", color: "var(--color-text-dim)" }}>
                {Math.round(stats.max)}{unit ? ` ${unit}` : ""}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={fillPath} fill={color} opacity={fillOpacity} />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={0}
          y1={avgY}
          x2={width}
          y2={avgY}
          stroke={color}
          strokeWidth="0.5"
          strokeDasharray="4,4"
          opacity={0.4}
        />
      </svg>
    </div>
  );
}
