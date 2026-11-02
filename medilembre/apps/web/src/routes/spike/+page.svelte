<script lang="ts">
  // Spike de Web Push: ativar -> agendar -> ver o que o servidor aceitou.
  // Anota em cada telefone: chegou? quando? apareceu no ecrã bloqueado?
  type Job = { label: string; due_at: string; sent_at: string | null; result: string | null };

  let msg = $state("");
  let endpoint = $state("");
  let jobs = $state<Job[]>([]);

  const ios = /iphone|ipad/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches;

  function b64(s: string) {
    const p = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function enable() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        msg = "Este navegador não suporta Web Push.";
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        msg = "Permissão recusada.";
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await (await fetch("/api/spike/vapid-key")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      await fetch("/api/spike/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      endpoint = sub.endpoint;
      msg = "Lembretes ativos neste telefone.";
      await refresh();
    } catch (e) {
      msg = `Erro: ${(e as Error).message}`;
    }
  }

  async function schedule(minutes: number) {
    await fetch("/api/spike/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint, minutes }),
    });
    await refresh();
  }

  async function refresh() {
    if (!endpoint) return;
    jobs = await (await fetch(`/api/spike/jobs?endpoint=${encodeURIComponent(endpoint)}`)).json();
  }

  $effect(() => {
    navigator.serviceWorker?.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => {
        if (s) {
          endpoint = s.endpoint;
          refresh();
        }
      });
  });
</script>

<main>
  <h1>MediLembre · teste de push</h1>
  {#if ios && !standalone}
    <p class="warn">No iPhone: toque em Partilhar → "Adicionar ao ecrã inicial" e abra a app a partir do ícone.</p>
  {/if}
  <button onclick={enable}>Ativar lembretes</button>
  {#if endpoint}
    <p>Agendar uma notificação daqui a:</p>
    <div class="row">
      {#each [1, 5, 30] as m}
        <button onclick={() => schedule(m)}>{m} min</button>
      {/each}
      <button class="ghost" onclick={refresh}>Atualizar</button>
    </div>
  {/if}
  <p aria-live="polite">{msg}</p>
  <ul>
    {#each jobs as j}
      <li>
        <b>{j.label}</b>: previsto {new Date(j.due_at).toLocaleTimeString("pt-PT")} —
        {j.sent_at ? `enviado, ${j.result}` : "em espera"}
      </li>
    {/each}
  </ul>
</main>

<style>
  :global(body) { margin: 0; font: 18px/1.4 system-ui, sans-serif; background: #f7faf8; color: #1d3a34; }
  main { max-width: 480px; margin: 0 auto; padding: 24px 20px; }
  h1 { font-size: 24px; font-weight: 500; }
  button { font: inherit; background: #237f72; color: #fff; border: 0; border-radius: 14px; padding: 14px 20px; min-height: 52px; }
  button.ghost { background: #e6f2ee; color: #237f72; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .warn { background: #fff3cd; padding: 12px; border-radius: 12px; }
  li { margin: 8px 0; font-size: 16px; }
</style>
