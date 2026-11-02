import { api, isOffline } from "./api";
import { clearAlarms } from "./local-notifications";

export const session = $state<{ status: "loading" | "in" | "out"; name: string }>({
  status: "loading",
  name: "",
});

const KEY = "ml:name";

export async function loadSession() {
  try {
    const me = await api<{ name: string }>("/auth/me");
    session.name = me.name;
    localStorage.setItem(KEY, me.name);
    session.status = "in";
  } catch (e) {
    const cached = localStorage.getItem(KEY);
    if (isOffline(e) && cached) {
      session.name = cached; // PWA offline: mostra os últimos dados em cache
      session.status = "in";
    } else {
      session.status = "out";
    }
  }
}

export async function clearLocal() {
  await clearAlarms();
  session.status = "out";
  session.name = "";
  localStorage.removeItem(KEY);
  localStorage.removeItem("ml:cache");
}
