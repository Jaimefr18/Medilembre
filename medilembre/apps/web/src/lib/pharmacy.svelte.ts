import { api } from "./api";

export const pharmacy = $state<{ status: "loading" | "in" | "out"; name: string; user: string }>({
  status: "loading",
  name: "",
  user: "",
});

export async function loadPharmacy() {
  try {
    const me = await api<{ user: string; pharmacy: string }>("/farmacia/auth/me");
    pharmacy.name = me.pharmacy;
    pharmacy.user = me.user;
    pharmacy.status = "in";
  } catch {
    pharmacy.status = "out";
  }
}

export async function logoutPharmacy() {
  await api("/farmacia/auth/logout", { method: "POST" }).catch(() => {});
  pharmacy.status = "out";
  pharmacy.name = pharmacy.user = "";
}
