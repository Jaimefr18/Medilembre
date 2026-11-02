import { Capacitor } from "@capacitor/core";

const CH = "medilembre-alarm";
const native = () => Capacitor.isNativePlatform();

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function setupAlarms() {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  await LN.createChannel({
    id: CH,
    name: "Lembretes de medicação",
    importance: 5,
    vibration: true,
  });
}

export async function syncAlarms(reminders: { id: string; time: string }[]) {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  const p = await LN.getPending();
  if (p.notifications.length) await LN.cancel({ notifications: p.notifications });
  await LN.schedule({
    notifications: reminders.map((r) => {
      const [hour, minute] = r.time.split(":").map(Number);
      return {
        id: hashId(r.id),
        title: "MediLembre",
        body: "Hora do seu lembrete",
        channelId: CH,
        schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
      };
    }),
  });
}

export async function clearAlarms() {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  const p = await LN.getPending();
  if (p.notifications.length) await LN.cancel({ notifications: p.notifications });
}