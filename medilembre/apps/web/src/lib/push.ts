import { api } from "./api";

export type PushState = "granted" | "denied" | "default" | "unsupported";

export function pushState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function b64(s: string) {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Pede permissão, subscreve e regista a subscrição no cliente autenticado. */
export async function enablePush(): Promise<PushState> {
  if (pushState() === "unsupported") return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission;
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>("/push/vapid-key");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await api("/push/subscribe", { method: "POST", body: sub.toJSON() });
  return "granted";
}

/** No logout: remove a subscrição deste dispositivo (best-effort). */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
  } catch {}
}
