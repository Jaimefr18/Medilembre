export const clock = $state({ now: Date.now() });
if (typeof window !== "undefined") setInterval(() => (clock.now = Date.now()), 30_000);

/** Minutos até "HH:MM" de hoje (negativo se já passou). Lê clock.now para reagir ao tempo. */
export function minsUntil(t: string) {
  const [h, m] = t.split(":").map(Number);
  const n = new Date(clock.now);
  return h * 60 + m - (n.getHours() * 60 + n.getMinutes());
}

export function rel(t: string) {
  const m = minsUntil(t);
  if (m <= 0) return "Agora";
  if (m < 60) return `Em ${m} min`;
  return `Em ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export function hello() {
  const h = new Date(clock.now).getHours();
  return h < 12 ? "Bom dia" : h < 19 ? "Boa tarde" : "Boa noite";
}

export function dateParts(): [string, string] {
  const d = new Date(clock.now);
  const day = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long" }).format(d);
  const wd = new Intl.DateTimeFormat("pt-PT", { weekday: "long" }).format(d);
  return [day, wd[0].toUpperCase() + wd.slice(1)];
}
