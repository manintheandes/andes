import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./app/providers";
import { App } from "./app/App";
import "./styles/index.css";
import { initGlobalHaptics } from "./lib/native/haptics";

// Enable CSS :active on iOS — WKWebView disables it without a touchstart listener
document.addEventListener("touchstart", () => {}, { passive: true });

// Light haptic vibration on every button tap
initGlobalHaptics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
