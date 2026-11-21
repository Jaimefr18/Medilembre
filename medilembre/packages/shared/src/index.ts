import { z } from "zod";

export const TimeHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const DateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PlanItemInput = z.object({
  medication: z.string().min(1).max(120),
  dosage: z.string().max(120).optional(),
  timesLocal: z.array(TimeHHmm).min(1).max(8),
});

export const ReminderInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    dose: z.string().trim().max(80).default(""),
    times: z
      .array(TimeHHmm)
      .min(1)
      .max(8)
      .refine((arr) => new Set(arr).size === arr.length, "horários duplicados"),
    startDate: DateYmd.default(() => new Date().toISOString().slice(0, 10)),
    endDate: DateYmd.nullable().default(null),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "data de fim deve ser igual ou posterior à data de início",
    path: ["endDate"],
  });

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

// Notificação discreta: o detalhe só aparece ao abrir a app.
export const NOTIFICATION_TEXT = { title: "MediLembre", body: "Hora do seu lembrete" } as const;
