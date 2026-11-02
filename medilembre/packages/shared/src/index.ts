import { z } from "zod";

export const TimeHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const PlanItemInput = z.object({
  medication: z.string().min(1).max(120),
  dosage: z.string().max(120).optional(),
  timesLocal: z.array(TimeHHmm).min(1).max(8),
});

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const SpikeScheduleInput = z.object({
  endpoint: z.string().url(),
  minutes: z
    .number()
    .min(0)
    .max(24 * 60),
  label: z.string().max(80).optional(),
});

// Notificação discreta: o detalhe só aparece ao abrir a app.
export const NOTIFICATION_TEXT = { title: "MediLembre", body: "Hora do seu lembrete" } as const;
