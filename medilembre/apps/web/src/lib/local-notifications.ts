import { Capacitor } from "@capacitor/core";

const CH = "medilembre-alarm";
const native = () => Capacitor.isNativePlatform();

type R = { id: string; time: string; startDate: string; endDate: string | null; done: boolean };
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

export async function syncAlarms(reminders: R[]) {
  if (!native()) return;
  const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
  const now = Date.now();
  const list: {
    id: number;
    title: string;
    body: string;
    channelId: string;
    schedule: { at: Date; allowWhileIdle: boolean };
  }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setDate(day.getDate() + i);
    const key = ymd(day);
    for (const r of reminders) {
      if (key < r.startDate || (r.endDate && key > r.endDate) || (i === 0 && r.done)) continue;
      const [h, m] = r.time.split(":").map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at.getTime() <= now) continue;
      list.push({
        id: hashId(r.id + key),
        title: "MediLembre",
        body: "Hora do seu lembrete",
        channelId: CH,
        schedule: { at, allowWhileIdle: true },
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
