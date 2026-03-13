export function TopoBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 400 860" preserveAspectRatio="none">
        <path d="M 0,72 C 80,64 160,80 240,68 C 320,56 380,76 400,72" stroke="rgba(255,255,255,0.07)" strokeWidth="0.7" fill="none" />
        <path d="M 0,78 C 90,86 200,66 300,82 C 360,90 400,76 400,78" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" fill="none" />
        <path d="M 0,788 C 60,780 140,796 220,784 C 300,772 360,792 400,788" stroke="rgba(255,255,255,0.07)" strokeWidth="0.7" fill="none" />
        <path d="M 0,794 C 100,802 200,782 320,798 C 370,804 400,790 400,794" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" fill="none" />
        <path d="M 28,0 C 22,140 34,280 26,430 C 18,580 32,720 28,860" stroke="rgba(255,255,255,0.035)" strokeWidth="0.5" fill="none" />
        <path d="M 372,0 C 378,160 366,320 374,480 C 382,640 368,760 372,860" stroke="rgba(255,255,255,0.035)" strokeWidth="0.5" fill="none" />
        <path d="M 0,340 C 120,332 280,348 400,340" stroke="rgba(255,255,255,0.018)" strokeWidth="0.5" fill="none" />
        <path d="M 0,560 C 100,568 300,552 400,560" stroke="rgba(255,255,255,0.018)" strokeWidth="0.5" fill="none" />
      </svg>
    </div>
  );
}
