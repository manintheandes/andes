interface HomeScreenProps {
  onRecord: () => void;
  onOpenRecords: () => void;
  onOpenSleep: () => void;
  onOpenCoach: () => void;
}

function TrailDivider({ className }: { className?: string }) {
  return (
    <svg width="100%" height="6" preserveAspectRatio="none" viewBox="0 0 300 6" className={className}>
      <path d="M 0,3 C 50,1 100,5 150,3 C 200,1 250,5 300,3" stroke="rgba(90,230,222,0.15)" strokeWidth="1" fill="none" />
    </svg>
  );
}

/* ── Sumi-e Icons ─────────────────────────────────── */

const T = "#5ae6de";

export function AlpacaIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
      <path d="M 12,16 C 10,24 8,30 6,36" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
      <path d="M 26,14 C 28,22 30,28 31,36" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
      <circle cx="8.5" cy="6" r="0.5" fill={color} />
    </svg>
  );
}

export function HistoryIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 8,10 C 12,9 20,10 32,11" stroke={color} strokeWidth="0.7" strokeLinecap="round" fill="none" />
      <path d="M 8,20 C 14,19 24,21 32,20" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M 8,30 C 16,29 22,31 32,30" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.3" />
    </svg>
  );
}

export function SleepIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 22,6 C 14,8 10,14 10,22 C 10,28 16,34 24,34 C 28,34 31,32 33,29 C 28,32 20,30 16,24 C 12,18 14,10 22,6" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function CoachIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 10,28 L 20,12 L 30,28" stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M 17,28 C 18,22 20,18 20,16" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 23,28 C 22,22 20,18 20,16" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 4,28 C 12,27 28,27 36,28" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.3" />
    </svg>
  );
}

export function RideIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 6,26 C 4,20 8,14 14,14 C 20,14 22,20 20,26 C 18,30 10,30 6,26" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 20,26 C 18,20 22,14 28,14 C 34,14 36,20 34,26 C 32,30 24,30 20,26" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 14,14 C 18,10 22,10 28,14" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.6" />
    </svg>
  );
}

export function WalkIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 14,30 C 14,28 16,26 18,28 C 18,30 16,32 14,30" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 22,22 C 22,20 24,18 26,20 C 26,22 24,24 22,22" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 14,14 C 14,12 16,10 18,12 C 18,14 16,16 14,14" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function YogaIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 20,10 C 20,14 20,18 20,24" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 10,28 C 14,24 20,24 20,24 C 20,24 26,24 30,28" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="8" r="2" stroke={color} strokeWidth="0.5" fill="none" />
    </svg>
  );
}

export function HikeIcon({ size = 56, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" width={size} height={size}>
      <path d="M 4,34 C 10,26 16,14 20,6 C 24,14 30,26 36,34" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 14,34 C 16,28 18,20 20,14" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.4" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="6" stroke={color} strokeWidth="0.6" fill="none" />
      <path d="M 20,4 C 20,8 20,12 20,14" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 20,26 C 20,28 20,32 20,36" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 4,20 C 8,20 12,20 14,20" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 26,20 C 28,20 32,20 36,20" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 8.6,8.6 C 10.4,10.4 12,12 13.2,13.2" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 26.8,26.8 C 28.6,28.6 30.2,30.2 31.4,31.4" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 31.4,8.6 C 29.6,10.4 28,12 26.8,13.2" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 13.2,26.8 C 11.4,28.6 9.8,30.2 8.6,31.4" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}

export function MapIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M 3,8 C 8,6 16,10 21,8" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
      <path d="M 3,12 C 10,14 14,10 21,12" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 3,16 C 8,18 16,14 21,16" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}

export function GpsIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="2" fill={color} />
      <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="0.5" fill="none" opacity="0.6" />
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="0.4" fill="none" opacity="0.3" />
    </svg>
  );
}

export function HeartIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M 12,20 C 4,14 2,9 6,5 C 8,3 11,4 12,7 C 13,4 16,3 18,5 C 22,9 20,14 12,20" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function CloseIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 10,10 C 16,16 24,24 30,30" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
      <path d="M 30,10 C 24,16 16,24 10,30" stroke={color} strokeWidth="0.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ── Action Icons (recording controls) ────────── */

export function PauseIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 14,8 C 14,14 14,26 14,32" stroke={color} strokeWidth="0.8" strokeLinecap="round" fill="none" />
      <path d="M 26,8 C 26,14 26,26 26,32" stroke={color} strokeWidth="0.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function PlayIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 12,6 C 12,14 12,26 12,34 L 32,20 Z" stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function StopIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 10,10 L 30,10 L 30,30 L 10,30 Z" stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function CheckIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 8,22 C 12,26 16,30 18,32 C 22,24 28,14 34,8" stroke={color} strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function BackIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 24,8 C 18,14 14,18 10,20 C 14,22 18,26 24,32" stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function SplitsIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M 6,32 C 10,24 16,12 22,8 C 26,14 32,26 36,32" stroke={color} strokeWidth="0.5" strokeLinecap="round" fill="none" />
      <path d="M 6,32 L 36,32" stroke={color} strokeWidth="0.3" strokeLinecap="round" fill="none" opacity="0.3" />
    </svg>
  );
}

export function SensorIcon({ size = 20, color = T }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="4" stroke={color} strokeWidth="0.5" fill="none" />
      <path d="M 10,10 C 14,14 16,16 16,20" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 30,10 C 26,14 24,16 24,20" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 10,30 C 14,26 16,24 16,20" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M 30,30 C 26,26 24,24 24,20" stroke={color} strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}

export { TrailDivider };

export function HomeScreen({ onRecord, onOpenRecords, onOpenSleep, onOpenCoach }: HomeScreenProps) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          aspectRatio: "1",
          maxHeight: 380,
          position: "relative",
        }}
      >
        {/* Trail cross-hairs */}
        <svg
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          viewBox="0 0 280 280"
          preserveAspectRatio="none"
        >
          <path d="M 0,139 C 40,132 85,148 140,137 C 195,126 240,150 280,139" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
          <path d="M 0,143 C 45,150 95,132 145,143 C 195,154 245,130 280,143" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
          <path d="M 139,0 C 132,40 148,85 137,140 C 126,195 150,240 139,280" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
          <path d="M 143,0 C 150,45 132,95 143,140 C 154,195 130,240 143,280" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
        </svg>

        <button
          onClick={onRecord}
          className="flex items-center justify-center transition-transform active:scale-[0.95]"
        >
          <AlpacaIcon size={84} />
        </button>
        <button
          onClick={onOpenRecords}
          className="flex items-center justify-center transition-transform active:scale-[0.95]"
        >
          <HistoryIcon size={84} />
        </button>
        <button
          onClick={onOpenSleep}
          className="flex items-center justify-center transition-transform active:scale-[0.95]"
        >
          <SleepIcon size={84} />
        </button>
        <button
          onClick={onOpenCoach}
          className="flex items-center justify-center transition-transform active:scale-[0.95]"
        >
          <CoachIcon size={84} />
        </button>
      </div>
    </div>
  );
}
