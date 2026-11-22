import { Capacitor } from "@capacitor/core";

// Os canais Android são imutáveis depois de criados: para mudar som/importância é preciso um id novo.
const CH = "medilembre-alarm-v2";
const OLD_CH = "medilembre-alarm";
// Ficheiro em android/app/src/main/res/raw/ (copiado por scripts/android-setup.mjs).
const SOUND = "medilembre_alarm.wav";
const native = () => Capacitor.isNativePlatform();

type R = {
  id: string;
  time: string;
  name?: string;
  dose?: string;
  startDate: string;
  endDate: string | null;
  done: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647 || 1;
}

export async function setupAlarms() {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") {
      await LN.requestPermissions();
    }
  } catch {}

  await LN.deleteChannel({ id: OLD_CH }).catch(() => {});
  await LN.createChannel({
    id: CH,
    name: "Lembretes de medicação",
    description: "Alarme sonoro na hora de tomar o medicamento",
    importance: 5, // IMPORTANCE_HIGH: som + pop-up
    sound: SOUND,
    vibration: true,
    lights: true,
    visibility: 1, // VISIBILITY_PUBLIC: visível no ecrã de bloqueio
  });
}

export type AlarmStatus = { native: boolean; notifications: string; exact: string };

/** Estado das permissões que fazem o alarme tocar a horas (só na app nativa). */
export async function alarmStatus(): Promise<AlarmStatus> {
  if (!native()) return { native: false, notifications: "n/a", exact: "n/a" };
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  const notifications = (await LN.checkPermissions().catch(() => null))?.display ?? "unknown";
  const exact =
    (await LN.checkExactNotificationSetting().catch(() => null))?.exact_alarm ?? "unknown";
  return { native: true, notifications, exact };
}

/** Pede a permissão de notificações e abre o ecrã do Android para permitir alarmes exatos. */
export async function allowAlarms() {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  await LN.requestPermissions().catch(() => {});
  const exact = await LN.checkExactNotificationSetting().catch(() => null);
  if (exact && exact.exact_alarm !== "granted")
    await LN.changeExactNotificationSetting().catch(() => {});
}

/** Dispara já (3 s) um lembrete de teste, para ouvir o toque e ver o aspeto no ecrã bloqueado. */
export async function testAlarm(): Promise<"native" | "web" | "denied" | "unsupported"> {
  if (native()) {
    const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
    await LN.schedule({
      notifications: [
        {
          id: 2147483000,
          title: "MediLembre",
          body: "Teste: é assim que o lembrete vai tocar",
          channelId: CH,
          schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        },
      ],
    });
    return "native";
  }
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("MediLembre", {
    body: "Teste: o som depende das definições de notificação do telemóvel",
    icon: "/icon.svg",
    tag: "teste",
    vibrate: [300, 150, 300, 150, 600],
  } as NotificationOptions);
  return "web";
}

export async function syncAlarms(reminders: R[]) {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  const now = Date.now();
  const list: {
    id: number;
    title: string;
    body: string;
    channelId: string;
    extra: { reminderId: string; time: string; date: string };
    schedule: { at: Date; allowWhileIdle: boolean };
  }[] = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setDate(day.getDate() + i);
    const key = ymd(day);

    for (const r of reminders) {
      if (key < r.startDate || (r.endDate && key > r.endDate) || (i === 0 && r.done)) continue;
      const [h, m] = r.time.split(":").map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
      if (at.getTime() <= now) continue;

      list.push({
        id: hashId(r.id + key),
        title: "MediLembre",
        body: "Hora do seu lembrete",
        channelId: CH,
        extra: { reminderId: r.id, time: r.time, date: key },
        schedule: { at, allowWhileIdle: true }, // allowWhileIdle garante disparo em Doze Mode
      });
    }
  }

  list.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  const p = await LN.getPending();
  if (p.notifications.length) await LN.cancel({ notifications: p.notifications });
  if (list.length) await LN.schedule({ notifications: list.slice(0, 60) });
}

export async function clearAlarms() {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  const p = await LN.getPending();
  if (p.notifications.length) await LN.cancel({ notifications: p.notifications });
}
