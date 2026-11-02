<script lang="ts">
  import Head from "$lib/Head.svelte";
  import Icon from "$lib/Icon.svelte";
  import { data, reservationOf, reserve } from "$lib/data.svelte";
</script>

<div class="scr">
  <Head />
  <h1 style="font-size:32px">Reservas</h1>
  <p class="mut" style="font-size:16px">Peça o seu medicamento antes de acabar.</p>

  {#each data.products as p (p.id)}
    {@const res = reservationOf(p.id)}
    <div class="box">
      <div class="med" style="margin:0"><i><Icon name="box" /></i><div><b>{p.name}</b><span>{p.pack}</span></div></div>
      <div class="row" style="margin-top:10px">
        <span class="mut" style="font-size:13px;max-width:55%">Consulte a disponibilidade na farmácia.</span>
        {#if res}<span class="tag">{res.status === "confirmada" ? "Confirmada" : "Pendente"}</span>
        {:else}<button class="sm" onclick={() => reserve(p.id)}>Reservar →</button>{/if}
      </div>
    </div>
  {:else}
    <p class="mut" style="margin-top:20px">A sua farmácia ainda não publicou medicamentos.</p>
  {/each}
</div>
