import { Haptics, ImpactStyle } from "@capacitor/haptics";

let available = true;

export function tapHaptic() {
  if (!available) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
    available = false;
  });
}

export function successHaptic() {
  if (!available) return;
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {
    available = false;
  });
}

export function initGlobalHaptics() {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, [role='button'], a")) {
        tapHaptic();
      }
    },
    { passive: true, capture: true },
  );
}
