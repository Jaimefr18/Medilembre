// Prepara o projeto Android gerado por `npx cap add android` (idempotente; pode correr-se mais vezes).
// Uso: node scripts/android-setup.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const manifest = "android/app/src/main/AndroidManifest.xml";
if (!existsSync(manifest)) {
  console.error("Sem projeto Android. Corra primeiro: pnpm build && npx cap add android");
  process.exit(1);
}

// 1) Som do alarme (canal medilembre-alarm-v2 usa "medilembre_alarm.wav" em res/raw).
mkdirSync("android/app/src/main/res/raw", { recursive: true });
copyFileSync(
  "resources/android/medilembre_alarm.wav",
  "android/app/src/main/res/raw/medilembre_alarm.wav",
);
console.log("✓ som copiado para res/raw");

// 2) Permissões. `android.permissions` no capacitor.config.ts não existe: tem de ser no manifesto.
const want = [
  "android.permission.INTERNET",
  "android.permission.POST_NOTIFICATIONS", // Android 13+
  "android.permission.SCHEDULE_EXACT_ALARM", // Android 12+: o utilizador tem de permitir (ecrã aberto pela app)
  "android.permission.RECEIVE_BOOT_COMPLETED", // reagendar alarmes depois de reiniciar
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK",
];
let xml = readFileSync(manifest, "utf8");
const missing = want.filter((p) => !xml.includes(`"${p}"`));
if (missing.length) {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
  xml = xml.replace("</manifest>", `${lines}\n</manifest>`);
  writeFileSync(manifest, xml);
}
console.log(
  missing.length ? `✓ permissões adicionadas: ${missing.join(", ")}` : "✓ permissões já presentes",
);
console.log("Depois: npx cap sync android && npx cap open android");
