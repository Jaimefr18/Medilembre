<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { showToast } from "$lib/toast.svelte";

  type R = { id: string; status: string; createdAt: string; customer: string; phone: string | null; product: string; pack: string };
  let rows = $state<R[]>([]);
  let loading = $state(true);
  let only = $state(true);
  const shown = $derived(only ? rows.filter((r) => r.status === "pendente") : rows);
  const pending = $derived(rows.filter((r) => r.status === "pendente").length);

  async function load() {
    try {
      rows = await api<R[]>("/farmacia/reservas");
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function decide(r: R, status: "confirmada" | "recusada") {
    try {
      await api(`/farmacia/reservas/${r.id}`, { method: "PATCH", body: { status } });
      await load();
    } catch (e) {
      showToast((e as Error).message);
      await load();
    }
  }
  const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<h1 style="font-size:28px;margin-bottom:12px">Reservas</h1>
<div class="tabs" role="tablist">
  <button role="tab" aria-selected={only} class:a={only} onclick={() => (only = true)}>Pendentes ({pending})</button>
  <button role="tab" aria-selected={!only} class:a={!only} onclick={() => (only = false)}>Todas</button>
</div>

{#if loading}
  <p class="mut">A carregar…</p>
{:else}
  {#each shown as r (r.id)}
    <div class="box">
      <div class="row" style="gap:12px">
        <div style="flex:1">
          <b style="font-size:18px">{r.product}</b> <span class="mut">{r.pack}</span>
          <div class="mut" style="font-size:14px">{r.customer}{r.phone ? " · " + r.phone : ""} · {when(r.createdAt)}</div>
        </div>
        {#if r.status === "pendente"}
          <button class="sm" onclick={() => decide(r, "recusada")}>Recusar</button>
          <button class="sm" style="background:var(--pri);color:#fff" onclick={() => decide(r, "confirmada")}>Confirmar</button>
        {:else}
          <span class="tag" class:n={r.status !== "confirmada"}>{r.status === "confirmada" ? "Confirmada" : "Recusada"}</span>
        {/if}
      </div>
    </div>
  {:else}
    <p class="mut" style="margin-top:20px">{only ? "Sem reservas pendentes." : "Ainda não há reservas."}</p>
  {/each}
{/if}
