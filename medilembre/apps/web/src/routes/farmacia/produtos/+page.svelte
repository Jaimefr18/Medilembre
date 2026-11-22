<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { showToast } from "$lib/toast.svelte";

  type P = { id: string; name: string; pack: string; active: boolean };
  let rows = $state<P[]>([]);
  let loading = $state(true);
  let name = $state("");
  let pack = $state("");
  let busy = $state(false);

  async function load() {
    try {
      rows = await api<P[]>("/farmacia/produtos");
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function add(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      await api("/farmacia/produtos", { method: "POST", body: { name, pack } });
      name = pack = "";
      await load();
    } catch (x) {
      showToast((x as Error).message);
    } finally {
      busy = false;
    }
  }

  async function toggle(p: P) {
    try {
      await api(`/farmacia/produtos/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      await load();
    } catch (e) {
      showToast((e as Error).message);
    }
  }
</script>

<h1 style="font-size:28px;margin-bottom:12px">Produtos</h1>
<p class="mut" style="font-size:15px;margin-bottom:12px">Só os produtos ativos aparecem aos clientes para reservar.</p>

<form class="box" onsubmit={add}>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <div class="in" style="flex:2;min-width:180px"><input placeholder="Nome (ex.: Losartana 50 mg)" bind:value={name} maxlength="120" required aria-label="Nome do produto" /></div>
    <div class="in" style="flex:2;min-width:180px"><input placeholder="Embalagem (ex.: 30 comprimidos)" bind:value={pack} maxlength="120" aria-label="Embalagem" /></div>
    <button class="btn" style="flex:1;min-width:120px;height:54px" disabled={busy || !name.trim()}>Adicionar</button>
  </div>
</form>

{#if loading}
  <p class="mut">A carregar…</p>
{:else}
  {#each rows as p (p.id)}
    <div class="box">
      <div class="row" style="gap:12px">
        <div style="flex:1;opacity:{p.active ? 1 : 0.55}"><b style="font-size:18px">{p.name}</b><div class="mut" style="font-size:14px">{p.pack || "—"}</div></div>
        <button class="sm" onclick={() => toggle(p)}>{p.active ? "Desativar" : "Ativar"}</button>
      </div>
    </div>
  {:else}
    <p class="mut" style="margin-top:20px">Ainda não há produtos.</p>
  {/each}
{/if}
