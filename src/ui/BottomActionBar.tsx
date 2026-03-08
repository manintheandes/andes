import type { ReactNode } from "react";

interface ActionButton {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  tone?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
}

interface BottomActionBarProps {
  actions: ActionButton[];
}

export function BottomActionBar({ actions }: BottomActionBarProps) {
  return (
    <div className="flex items-center justify-center gap-5">
      {actions.map((action) => {
        const palette = {
          primary: { background: "var(--color-accent)", borderColor: "transparent", color: "#081314", size: 92 },
          secondary: { background: "rgba(255,255,255,0.02)", borderColor: "var(--color-border)", color: "var(--color-text)", size: 82 },
          ghost: { background: "transparent", borderColor: "var(--color-border)", color: "var(--color-text-soft)", size: 68 },
          danger: { background: "transparent", borderColor: "rgba(90,230,222,0.28)", color: "var(--color-accent)", size: 82 },
        }[action.tone ?? "secondary"];

        return (
          <button
            key={action.label}
            onClick={action.onPress}
            disabled={action.disabled}
            className="flex flex-col items-center justify-center rounded-full border transition-transform duration-200"
            style={{
              width: palette.size,
              height: palette.size,
              background: palette.background,
              borderColor: palette.borderColor,
              color: palette.color,
              opacity: action.disabled ? 0.45 : 1,
            }}
          >
            {action.icon}
            {action.icon ? null : (
              <span style={{ marginTop: 0, fontFamily: "var(--font-sharp)", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {action.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
