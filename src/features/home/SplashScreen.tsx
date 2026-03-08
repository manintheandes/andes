import { useEffect, useState } from "react";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 100);
    const t2 = setTimeout(() => setPhase("out"), 1800);
    const t3 = setTimeout(onDone, 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        opacity: phase === "out" ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      <div
        style={{
          width: "min(55vw, 200px)",
          height: "min(55vw, 200px)",
          borderRadius: "36px",
          overflow: "hidden",
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "scale(0.9)" : "scale(1)",
          transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 0 80px rgba(90, 230, 222, 0.08)",
        }}
      >
        <img
          src="/icon-512.png"
          alt="Alpaca"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div
        style={{
          marginTop: "1.5rem",
          fontFamily: "var(--font-haas)",
          fontSize: "clamp(1.4rem, 5vw, 2rem)",
          letterSpacing: "-0.04em",
          fontWeight: 300,
          color: "var(--color-text)",
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(8px)" : "translateY(0)",
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s",
        }}
      >
        Alpaca
      </div>
    </div>
  );
}
