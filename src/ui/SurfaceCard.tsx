import type { CSSProperties, ReactNode } from "react";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function SurfaceCard({ children, className = "", style }: SurfaceCardProps) {
  return (
    <div
      className={`rounded-[28px] border ${className}`}
      style={{
        background: "rgba(255,255,255,0.012)",
        borderColor: "var(--color-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
