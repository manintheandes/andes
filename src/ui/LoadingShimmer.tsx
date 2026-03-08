interface LoadingShimmerProps {
  height?: number;
  radius?: number;
}

export function LoadingShimmer({ height = 88, radius = 24 }: LoadingShimmerProps) {
  return (
    <div
      className="overflow-hidden"
      style={{
        height,
        borderRadius: radius,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
        backgroundSize: "200% 100%",
        animation: "andes-shimmer 1.8s linear infinite",
      }}
    />
  );
}
