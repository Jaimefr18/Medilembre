import type { CapacitorConfig } from "@capacitor/cli";

// A app nativa carrega o site de produção: o WebView fica same-origin com a API (cookies e /api a funcionar)
// e os alarmes locais continuam a ser agendados pelo plugin nativo. Para testar em dev: CAP_SERVER_URL=https://<tunel>.
const url = process.env.CAP_SERVER_URL ?? "https://medilembre-medilembre.vercel.app";

const config: CapacitorConfig = {
  appId: "com.medilembre.app",
  appName: "MediLembre",
  webDir: "apps/web/build",
  server: {
    url,
    allowNavigation: [new URL(url).host],
    errorPath: "offline.html", // mostrado quando não há rede na abertura (ficheiro em apps/web/static)
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#237f72",
    },
  },
};

export default config;
