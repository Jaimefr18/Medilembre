import { api, isOffline } from "./api";
import { showToast } from "./toast.svelte";
import { syncAlarms } from "./local-notifications";

export type Reminder = { id: string; time: string; name: string; dose: string; done: boolean };
export type Product = { id: string; name: string; pack: string };
export type Reservation = { product_id: string; status: string };

const CACHE = "ml:cache";
const cached = (() => {
  try {
    if (typeof localStorage === "undefined") return null;
    return JSON.parse(localStorage.getItem(CACHE) ?? "null");
  } catch {
    return null;
  }
})();

export const data = $state({
  reminders: (cached?.reminders ?? []) as Reminder[],
  products: (cached?.products ?? []) as Product[],
  reservations: (cached?.reservations ?? []) as Reservation[],
  loaded: false,
});

const persist = () => {
  try {
    localStorage.setItem(CACHE, JSON.stringify({ reminders: data.reminders, products: data.products, reservations: data.reservations }));
  } catch {}
};

export async function loadAll() {
  try {
    const [r, p, v] = await Promise.all([
      api<Reminder[]>("/reminders"),
      api<Product[]>("/products"),
      api<Reservation[]>("/reservations"),
    ]);
    data.reminders = r;
    data.products = p;
    data.reservations = v;
    persist();
  } catch (e) {
    if (!isOffline(e)) showToast((e as Error).message);
  }
  data.loaded = true;
  await syncAlarms(data.reminders);
}

export const sorted = () => data.reminders.slice().sort((a, b) => a.time.localeCompare(b.time));
export const nextReminder = () => sorted().find((r) => !r.done);
export const doneCount = () => data.reminders.filter((r) => r.done).length;

export async function take(id: string) {
  const r = data.reminders.find((x) => x.id === id);
  if (!r) return;
  r.done = true; // otimista
  try {
    await api(`/reminders/${id}/take`, { method: "POST" });
    persist();
    showToast(`Registado: ${r.name} tomado`);
  } catch (e) {
    r.done = false;
    showToast(isOffline(e) ? "Sem ligação. Tente de novo." : (e as Error).message);
  }
}

export async function addReminder(input: { name: string; dose: string; time: string }) {
  const created = await api<Reminder>("/reminders", { method: "POST", body: input });
  data.reminders.push(created);
  persist();
  await syncAlarms(data.reminders);
}

export async function removeReminder(id: string) {
  await api(`/reminders/${id}`, { method: "DELETE" });
  data.reminders = data.reminders.filter((r) => r.id !== id);
  persist();
  await syncAlarms(data.reminders);
}

export const reservationOf = (productId: string) => data.reservations.find((r) => r.product_id === productId);

export async function reserve(productId: string) {
  try {
    await api("/reservations", { method: "POST", body: { productId } });
    data.reservations = await api<Reservation[]>("/reservations");
    persist();
    showToast("Pedido enviado à farmácia");
  } catch (e) {
    showToast((e as Error).message);
  }
}
