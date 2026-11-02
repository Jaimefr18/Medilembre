// Regras puras: sem frameworks, sem I/O. A parte mais testada do projeto.
import { DateTime } from "luxon";

export interface ReminderRule {
  timesLocal: string[]; // "HH:mm" no fuso da farmácia
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  zone: string; // IANA, ex.: "Africa/Luanda"
  from?: Date; // início da janela (por defeito: agora)
  days?: number; // tamanho da janela (por defeito: 7)
}

/** Gera as horas de lembrete em UTC dentro da janela e do período do plano. */
export function generateReminders(rule: ReminderRule): Date[] {
  const { timesLocal, startDate, endDate, zone, from = new Date(), days = 7 } = rule;
  const now = DateTime.fromJSDate(from, { zone });
  const planStart = DateTime.fromISO(startDate, { zone }).startOf("day").toMillis();
  const planEnd = DateTime.fromISO(endDate, { zone }).endOf("day").toMillis();
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = now.startOf("day").plus({ days: i });
    if (day.toMillis() < planStart || day.toMillis() > planEnd) continue;
    for (const t of timesLocal) {
      const [hour, minute] = t.split(":").map(Number);
      const due = day.set({ hour, minute, second: 0, millisecond: 0 });
      if (due.toMillis() >= now.toMillis()) out.push(due.toUTC().toJSDate());
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export type PlanState =
  | "rascunho"
  | "aguarda_ativacao"
  | "ativo"
  | "a_terminar"
  | "terminado"
  | "cancelado";

const TRANSITIONS: Record<PlanState, PlanState[]> = {
  rascunho: ["aguarda_ativacao", "cancelado"],
  aguarda_ativacao: ["ativo", "cancelado"],
  ativo: ["a_terminar", "cancelado"],
  a_terminar: ["ativo", "terminado", "cancelado"],
  terminado: [],
  cancelado: [],
};

export const canTransition = (from: PlanState, to: PlanState) => TRANSITIONS[from].includes(to);
