import { NOTIFICATION_TEXT } from "@medilembre/shared";
import type pg from "pg";
import webpush from "web-push";

const MAX_ATTEMPTS = 4; // 1.ª tentativa + 3 retries (1, 2 e 4 min depois)
const TTL_SECONDS = 1800; // o push morre no Push Service ao fim de 30 min
const CATCH_UP = "15 minutes"; // tolerância se o worker esteve em baixo
const EXPIRE_AFTER = "30 minutes"; // mais velho que isto já não faz sentido avisar

/**
 * Passo 1: cria um registo `pending` por cada lembrete que acabou de vencer (hora local da farmácia).
 * Idempotente (unique reminder_id+day). Olha para hoje e ontem para não perder lembretes à meia-noite.
 * Não envia se a dose já foi registada, nem lembretes criados depois da hora.
 */
export async function enqueueDue(pool: pg.Pool, at: Date = new Date()): Promise<number> {
  const r = await pool.query(
    `insert into client_reminder_sends (pharmacy_id, reminder_id, customer_id, day, due_at)
     select r.pharmacy_id, r.id, r.customer_id, d.day, x.due_at
     from client_reminders r
     join pharmacies p on p.id = r.pharmacy_id
     cross join generate_series(0, 1) as o
     cross join lateral (select (($1::timestamptz at time zone p.timezone)::date - o) as day) d
     cross join lateral (select ((d.day + r.at_time) at time zone p.timezone) as due_at) x
     where r.active
       and x.due_at <= $1::timestamptz
       and x.due_at >  $1::timestamptz - interval '${CATCH_UP}'
       and r.created_at <= x.due_at
       and not exists (select 1 from dose_logs l where l.reminder_id = r.id and l.day = d.day)
     on conflict (reminder_id, day) do nothing`,
    [at],
  );
  return r.rowCount ?? 0;
}

type Claimed = {
  id: string;
  reminder_id: string;
  customer_id: string;
  day: string;
  attempts: number;
};
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Passo 2: envia os `pending`. Ao reclamar cada linha já agenda o próximo retry com backoff
 * (se o processo morrer a meio, a linha volta a ser tentada). SKIP LOCKED permite vários workers.
 */
export async function sendPending(pool: pg.Pool, at: Date = new Date()) {
  const stats = { sent: 0, retry: 0, failed: 0, skipped: 0, noSub: 0, expired: 0 };

  const exp = await pool.query(
    `update client_reminder_sends set status = 'expired'
     where status = 'pending' and due_at < $1::timestamptz - interval '${EXPIRE_AFTER}'`,
    [at],
  );
  stats.expired = exp.rowCount ?? 0;

  const { rows } = await pool.query<Claimed>(
    `update client_reminder_sends s
        set attempts = s.attempts + 1,
            next_attempt_at = $1::timestamptz + make_interval(mins => power(2, s.attempts)::int)
      where s.id in (
        select id from client_reminder_sends
        where status = 'pending' and next_attempt_at <= $1::timestamptz
        order by due_at limit 100 for update skip locked)
      returning s.id, s.reminder_id, s.customer_id, s.day::text as day, s.attempts`,
    [at],
  );

  const finish = (id: string, status: string, err: string | null = null) =>
    pool.query(
      `update client_reminder_sends
          set status = $2, last_error = $3, sent_at = case when $2 = 'sent' then now() else sent_at end
        where id = $1`,
      [id, status, err],
    );

  for (const row of rows) {
    // Já tomou entretanto? Então não incomoda.
    const taken = await pool.query(
      "select 1 from dose_logs where reminder_id = $1 and day = $2::date",
      [row.reminder_id, row.day],
    );
    if (taken.rowCount) {
      await finish(row.id, "skipped");
      stats.skipped++;
      continue;
    }

    // Na app nativa (Android) não há subscrições push: os alarmes locais tratam do aviso.
    const subs = (
      await pool.query<Sub>(
        "select id, endpoint, p256dh, auth from client_push_subscriptions where customer_id = $1",
        [row.customer_id],
      )
    ).rows;
    if (!subs.length) {
      await finish(row.id, "no_subscription");
      stats.noSub++;
      continue;
    }

    const payload = JSON.stringify({
      ...NOTIFICATION_TEXT,
      tag: `lembrete-${row.reminder_id}`,
      url: "/",
    });
    let ok = 0;
    let transient: string | null = null;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            TTL: TTL_SECONDS,
            urgency: "high",
          },
        );
        ok++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscrição morta (app desinstalada / permissão revogada): limpa.
          await pool.query("delete from client_push_subscriptions where id = $1", [s.id]);
        } else {
          transient = `error:${status ?? (e as Error).message}`.slice(0, 200);
        }
      }
    }

    if (ok > 0) {
      await finish(row.id, "sent");
      stats.sent++;
    } else if (!transient) {
      await finish(row.id, "no_subscription", "todas as subscrições expiradas");
      stats.noSub++;
    } else if (row.attempts >= MAX_ATTEMPTS) {
      await finish(row.id, "failed", transient);
      stats.failed++;
    } else {
      await pool.query("update client_reminder_sends set last_error = $2 where id = $1", [
        row.id,
        transient,
      ]);
      stats.retry++;
    }
  }
  return stats;
}
