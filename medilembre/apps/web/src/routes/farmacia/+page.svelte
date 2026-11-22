<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { showToast } from "$lib/toast.svelte";

  type Row = { id: string; name: string; phone: string | null; hasAccount: boolean; reminders: number; expected: number; taken: number };
  type Detail = {
    reminders: { name: string; dose: string; time: string; startDate: string; endDate: string | null }[];
    days: { day: string; expected: number; taken: number }[];
  };
  type Issued = { code: string; kind: "activate" | "reset"; expiresAt: string };

  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let q = $state("");
  let open = $state<string | null>(null);
  let detail = $state<Detail | null>(null);
  let name = $state("");
  let phone = $state("");
  let busy = $state(false);
  let newDlg: HTMLDialogElement;
  let codeDlg: HTMLDialogElement;
  let issued = $state<(Issued & { who: string; link: string; qr: string }) | null>(null);

  const shown = $derived(rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const pct = (r: { expected: number; taken: number }) => (r.expected ? Math.round((r.taken / r.expected) * 100) : null);

  async function load() {
    try {
      rows = await api<Row[]>("/farmacia/clientes");
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function show(who: string, i: Issued) {
    const link = `${location.origin}/${i.kind === "reset" ? "recuperar" : "ativar"}?c=${i.code}`;
    const QR = await import("qrcode");
    issued = { ...i, who, link, qr: await QR.toDataURL(link, { margin: 1, width: 240 }) };
    codeDlg.showModal();
  }

  async function create() {
    busy = true;
    try {
      const r = await api<Issued & { customer: { name: string } }>("/farmacia/clientes", { method: "POST", body: { name, phone: phone || undefined } });
      newDlg.close();
      name = phone = "";
      await load();
      await show(r.customer.name, r);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function newCode(r: Row) {
    try {
      await show(r.name, await api<Issued>(`/farmacia/clientes/${r.id}/codigo`, { method: "POST" }));
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function toggle(r: Row) {
    if (open === r.id) {
      open = null;
      return;
    }
    open = r.id;
    detail = null;
    try {
      detail = await api<Detail>(`/farmacia/clientes/${r.id}`);
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showToast("Copiado");
    } catch {
      showToast("Não foi possível copiar");
    }
  };
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "long" });
</script>

<div class="row" style="gap:12px;margin-bottom:16px">
  <h1 style="font-size:28px">Clientes</h1>
  <button class="sm" onclick={() => newDlg.showModal()}>+ Novo cliente</button>
</div>
<div class="in" style="margin-bottom:12px"><input placeholder="Procurar por nome" bind:value={q} aria-label="Procurar cliente" /></div>

{#if loading}
  <p class="mut">A carregar…</p>
{:else}
  {#each shown as r (r.id)}
    <div class="box">
      <div class="row" style="gap:12px">
        <button style="text-align:left;flex:1" onclick={() => toggle(r)} aria-expanded={open === r.id}>
          <b style="font-size:18px">{r.name}</b>
          <div class="mut" style="font-size:14px">{r.phone ?? "sem telefone"} · {r.reminders} lembrete(s)</div>
        </button>
        <span class="tag" class:n={!r.hasAccount}>{r.hasAccount ? "Conta ativa" : "Por ativar"}</span>
        <span style="min-width:56px;text-align:right;font-weight:600;color:{pct(r) === null ? 'var(--mut)' : pct(r)! >= 80 ? 'var(--pri)' : '#b3261e'}" title="Adesão nos últimos 7 dias">
          {pct(r) === null ? "—" : pct(r) + "%"}
        </span>
        <button class="sm" onclick={() => newCode(r)}>{r.hasAccount ? "Recuperar senha" : "Novo código"}</button>
      </div>
      {#if open === r.id}
        <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
          {#if !detail}
            <p class="mut">A carregar…</p>
          {:else}
            <b style="font-size:15px">Últimos 7 dias (tomadas / previstas)</b>
            <div style="display:flex;gap:6px;margin:8px 0 12px;flex-wrap:wrap">
              {#each detail.days as d}
                <div class="tag" class:n={!d.expected} title={d.day}>{d.day.slice(8)}/{d.day.slice(5, 7)}: {d.taken}/{d.expected}</div>
              {/each}
            </div>
            {#each detail.reminders as m}
              <div class="mut" style="font-size:14px">{m.time} · {m.name} {m.dose} · {m.startDate}{m.endDate ? " → " + m.endDate : " (contínuo)"}</div>
            {:else}
              <p class="mut" style="font-size:14px">Ainda sem lembretes.</p>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <p class="mut" style="margin-top:20px">{rows.length ? "Nenhum cliente corresponde à pesquisa." : "Ainda não há clientes. Crie o primeiro."}</p>
  {/each}
{/if}

<dialog bind:this={newDlg}>
  <h2>Novo cliente</h2>
  <label for="cn">Nome</label>
  <div class="in"><input id="cn" bind:value={name} maxlength="120" /></div>
  <label for="cp">Telemóvel (opcional)</label>
  <div class="in"><input id="cp" bind:value={phone} maxlength="30" inputmode="tel" /></div>
  <div style="display:flex;gap:10px;margin-top:20px">
    <button class="sm" style="flex:1" onclick={() => newDlg.close()}>Cancelar</button>
    <button class="btn" style="flex:1;height:44px" disabled={busy || name.trim().length < 2} onclick={create}>Criar</button>
  </div>
</dialog>

<dialog bind:this={codeDlg}>
  {#if issued}
    <h2>{issued.kind === "reset" ? "Recuperar senha" : "Ativar conta"}</h2>
    <p class="mut" style="font-size:15px">{issued.who} · válido até {fmt(issued.expiresAt)}. Mostre o QR ou dite o código; só é mostrado agora.</p>
    <div class="c"><img src={issued.qr} alt="QR code do link de {issued.kind === 'reset' ? 'recuperação' : 'ativação'}" width="240" height="240" /></div>
    <div class="c" style="font-size:30px;font-weight:600;letter-spacing:4px;margin:8px 0">{issued.code}</div>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="sm" style="flex:1" onclick={() => copy(issued!.code)}>Copiar código</button>
      <button class="sm" style="flex:1" onclick={() => copy(issued!.link)}>Copiar link</button>
    </div>
    <button class="btn" style="margin-top:12px;height:44px" onclick={() => codeDlg.close()}>Fechar</button>
  {/if}
</dialog>
