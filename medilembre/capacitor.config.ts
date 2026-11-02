import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.medilembre.app",
  appName: "MediLembre",
  webDir: "apps/web/build",
  server: {
    url: "https://your-tunnel-url.trycloudflare.com",
    cleartext: true,
  },
  android: {
    permissions: ["SCHEDULE_EXACT_ALARM", "POST_NOTIFICATIONS", "RECEIVE_BOOT_COMPLETED"],
    allowMixedContent: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#237f72",
    },
  },
};

export default config;