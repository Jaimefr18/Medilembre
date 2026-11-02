<script lang="ts">
  import AddDialog from "$lib/AddDialog.svelte";
  import Head from "$lib/Head.svelte";
  import Icon from "$lib/Icon.svelte";
  import Tag from "$lib/Tag.svelte";
  import { data, doneCount, nextReminder, reservationOf, reserve, sorted, take } from "$lib/data.svelte";
  import { session } from "$lib/session.svelte";
  import { dateParts, hello, rel } from "$lib/time.svelte";

  let add: AddDialog;
  const n = $derived(nextReminder());
  const [day, weekday] = $derived(dateParts());
  const first = $derived(data.products[0]);
</script>

<div class="scr">
  <Head />
  <h1 style="font-size:32px">{hello()}, {session.name}</h1>
  <p class="mut" style="font-size:16px">Um lembrete de cada vez. Vamos lá?</p>

  {#if n}
    <div class="next">
      <small>
        <span><Icon name="clock" style="vertical-align:-2px" /> Próximo lembrete</span>
        <span style="color:var(--ink);font-weight:400">{rel(n.time)}</span>
      </small>
      <div class="med">
        <i><Icon name="pill" /></i>
        <div><b>{n.name}</b><span>{n.dose}</span></div>
        <time>{n.time}</time>
      </div>
      <button class="btn" onclick={() => take(n.id)}><Icon name="check" /> Já tomei</button>
    </div>
  {:else}
    <div class="next c">
      <b>{data.reminders.length ? "Tudo tomado por hoje" : "Ainda não tem lembretes"}</b>
      <p class="mut" style="font-size:15px">{data.reminders.length ? "Bom trabalho, até amanhã." : "Adicione o primeiro abaixo."}</p>
    </div>
  {/if}

  <div class="row"><h2>Hoje, {day}</h2><span class="mut" style="font-size:14px">{weekday}</span></div>
  <div class="prog"><i style="width:{data.reminders.length ? (doneCount() / data.reminders.length) * 100 : 0}%"></i></div>
  <div class="mut" style="text-align:right;font-size:13px;margin:-8px 0 8px">{doneCount()} de {data.reminders.length} tomados</div>

  <div class="list">
    {#each sorted() as r (r.id)}
      <div class="it" class:on={r.id === n?.id}>
        <time>{r.time}</time>
        <div class="m"><b>{r.name}</b><span class="s">{r.dose || "—"}</span></div>
        <Tag state={r.done ? "Tomado" : r.id === n?.id ? "Próximo" : "Agendado"} />
      </div>
    {/each}
  </div>

  <button class="add" onclick={() => add.open()}>+ Adicionar lembrete</button>

  {#if first}
    <h2 style="margin-bottom:4px">Medicamentos disponíveis</h2>
    <div class="box">
      <div class="med" style="margin:0"><i><Icon name="box" /></i><div><b>{first.name}</b><span>{first.pack}</span></div></div>
      <div class="row" style="margin-top:10px">
        <span class="mut" style="font-size:13px;max-width:55%">Consulte a disponibilidade na farmácia.</span>
        {#if reservationOf(first.id)}<span class="tag">Pendente</span>{:else}<button class="sm" onclick={() => reserve(first.id)}>Reservar →</button>{/if}
      </div>
    </div>
  {/if}
</div>
<AddDialog bind:this={add} />
