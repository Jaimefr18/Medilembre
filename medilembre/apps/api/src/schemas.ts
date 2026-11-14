import { z } from "zod";

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const SpikeScheduleInput = z.object({
  endpoint: z.string().url(),
  minutes: z.number().min(0).max(24 * 60),
  label: z.string().max(80).optional(),
});
