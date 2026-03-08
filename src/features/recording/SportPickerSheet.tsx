import type { SportType } from "../../types";
import { AlpacaIcon, RideIcon, WalkIcon, YogaIcon, HikeIcon, CloseIcon } from "../home/HomeScreen";

const SPORT_ICONS: Record<SportType, React.ReactNode> = {
  Run: <AlpacaIcon size={56} />,
  Ride: <RideIcon size={56} />,
  Walk: <WalkIcon size={56} />,
  Yoga: <YogaIcon size={56} />,
  Hike: <HikeIcon size={56} />,
};

const SPORTS: SportType[] = ["Run", "Ride", "Walk", "Yoga", "Hike"];

interface SportPickerSheetProps {
  open: boolean;
  onSelect: (sport: SportType) => void;
  onClose: () => void;
}

export function SportPickerSheet({ open, onSelect, onClose }: SportPickerSheetProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(2,3,4,0.95)" }}
    >
      {/* Topo background */}
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        viewBox="0 0 320 600"
        preserveAspectRatio="none"
      >
        <path d="M 0,150 C 80,140 160,160 240,148 C 300,138 320,152 320,150" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
        <path d="M 0,350 C 100,340 200,360 320,350" stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" />
      </svg>

      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, margin: "40px 0" }}>
          {SPORTS.map((sport) => (
            <button
              key={sport}
              onClick={() => onSelect(sport)}
              className="transition-transform active:scale-[0.93]"
              aria-label={sport}
            >
              {SPORT_ICONS[sport]}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-2 transition-opacity active:opacity-50" aria-label="Close">
          <CloseIcon size={24} />
        </button>
      </div>
    </div>
  );
}
