<script lang="ts">
  import AddDialog from "$lib/AddDialog.svelte";
  import Head from "$lib/Head.svelte";
  import Icon from "$lib/Icon.svelte";
  import Tag from "$lib/Tag.svelte";
  import { data, doneCount, nextReminder, removeReminder, sorted, take } from "$lib/data.svelte";
  import { showToast } from "$lib/toast.svelte";
  import { dateParts } from "$lib/time.svelte";

  let add: AddDialog;
  let sub = $state<"hoje" | "todos">("hoje");
  const n = $derived(nextReminder());
  const [day, weekday] = $derived(dateParts());

  async function del(id: string) {
    if (!confirm("Remover este lembrete?")) return;
    try {
      await removeReminder(id);
    } catch (e) {
      showToast((e as Error).message);
    }
  }
</script>

<div class="scr">
  <Head />
  <h1 style="font-size:32px">Lembretes</h1>
  <p class="mut" style="font-size:16px">Seu cuidado, um horário de cada vez.</p>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={sub === "hoje"} class:a={sub === "hoje"} onclick={() => (sub = "hoje")}>Hoje</button>
    <button role="tab" aria-selected={sub === "todos"} class:a={sub === "todos"} onclick={() => (sub = "todos")}>Todos os lembretes</button>
  </div>

  <div class="row"><h2>Hoje, {day}</h2><span class="mut" style="font-size:14px">{weekday}</span></div>
  <div class="prog"><i style="width:{data.reminders.length ? (doneCount() / data.reminders.length) * 100 : 0}%"></i></div>
  <div class="mut" style="text-align:right;font-size:13px;margin:-8px 0 12px">{doneCount()} de {data.reminders.length} tomados</div>

  {#each sorted() as r (r.id)}
    <div class="cardL" class:on={r.id === n?.id}>
      <div class="row">
        <span><b class="mut" style="font-size:20px">{r.time}</b> <span class="mut" style="font-size:13px">Todos os dias</span></span>
        <Tag state={r.done ? "Tomado" : r.id === n?.id ? "Próximo" : "Agendado"} />
      </div>
      <div class="med">
        <i><Icon name="pill" /></i>
        <div><b>{r.name}</b><span>{r.dose || "—"}</span></div>
        <button aria-label="Remover {r.name}" class="mut" style="margin-left:auto;font-size:22px" onclick={() => del(r.id)}>⋯</button>
      </div>
      {#if r.id === n?.id}<button class="btn" onclick={() => take(r.id)}><Icon name="check" /> Já tomei</button>{/if}
    </div>
  {/each}

  <button class="add" onclick={() => add.open()}>+ Adicionar lembrete</button>
</div>
<AddDialog bind:this={add} />
