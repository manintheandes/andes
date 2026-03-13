import type { CSSProperties, ReactNode } from "react";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function SurfaceCard({ children, className = "", style }: SurfaceCardProps) {
  return (
    <div className={`rounded-[28px] ${className}`} style={style}>
      {children}
    </div>
  );
}
