import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andes.app",
  appName: "Andes",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
