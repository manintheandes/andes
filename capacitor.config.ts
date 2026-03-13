import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andes.app",
  appName: "Alpaca",
  webDir: "dist",
  server: {
    androidScheme: "https",
    hostname: "andes.app",
  },
  ios: {
    backgroundColor: "#020304",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scrollEnabled: true,
    allowsLinkPreview: false,
    overrideUserAgent: "Alpaca/1.0",
  },
};

export default config;
