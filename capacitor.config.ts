import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andes.app",
  appName: "Andes",
  webDir: "dist",
  server: {
    androidScheme: "https",
    hostname: "andes.app",
  },
  ios: {
    backgroundColor: "#0a0a0a",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scrollEnabled: false,
    allowsLinkPreview: false,
    overrideUserAgent: "Andes/1.0",
  },
};

export default config;
