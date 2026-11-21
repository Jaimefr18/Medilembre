<script lang="ts">
  import RangeCalendar from "./RangeCalendar.svelte";
  import { addReminders } from "./data.svelte";
  import { showToast } from "./toast.svelte";

  const PRESETS: Record<number, string[]> = {
    1: ["08:00"],
    2: ["08:00", "20:00"],
    3: ["08:00", "14:00", "20:00"],
    4: ["06:00", "12:00", "18:00", "22:00"],
  };
  let dlg: HTMLDialogElement;
  let step = $state(1);
  let name = $state("");
  let dose = $state("");
  let freq = $state(1);
  let times = $state<string[]>([...PRESETS[1]]);
  let start = $state("");
  let end = $state("");
  let open_ended = $state(false);
  let busy = $state(false);

  export function open() {
    step = 1;
    name = "";
    dose = "";
    freq = 1;
    times = [...PRESETS[1]];
    start = "";
    end = "";
    open_ended = false;
    dlg.showModal();
  }
  const pick = (n: number) => {
    freq = n;
    times = [...PRESETS[n]];
  };
  const valid = $derived(
    step === 1
      ? name.trim().length > 0
      : step === 2
        ? times.every(Boolean) && new Set(times).size === times.length
        : Boolean(start),
  );

  async function confirm() {
    busy = true;
    try {
      await addReminders({
        name: name.trim(),
        dose: dose.trim(),
        times: [...times].sort(),
        startDate: start,
        endDate: open_ended ? null : end || start,
      });
      dlg.close();
      showToast("Lembrete criado");
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dlg}>
  <p class="mut" style="font-size:14px">Passo {step} de 3</p>
  {#if step === 1}
    <h2>Que medicamento?</h2>
    <label for="n">Nome</label>
    <div class="in"><input id="n" bind:value={name} maxlength="80" placeholder="Ex.: Paracetamol" /></div>
    <label for="d">Dose (opcional)</label>
    <div class="in"><input id="d" bind:value={dose} maxlength="80" placeholder="Ex.: 500 mg" /></div>
  {:else if step === 2}
    <h2>Quantas vezes por dia?</h2>
    <div class="chips">
      {#each [1, 2, 3, 4] as n}
        <button class:a={freq === n} onclick={() => pick(n)}>{n}x</button>
      {/each}
    </div>
    {#each times as _, i}
      <label for="t{i}">{i + 1}.ª toma</label>
      <div class="in"><input id="t{i}" type="time" bind:value={times[i]} /></div>
    {/each}
  {:else}
    <h2>Durante quanto tempo?</h2>
    <RangeCalendar bind:start bind:end />
    <label style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:12px">
      <input type="checkbox" bind:checked={open_ended} /> Sem data de fim (uso contínuo)
    </label>
    <p class="mut" style="font-size:14px;margin-top:8px">
      {name} · {freq}x/dia ({[...times].sort().join(", ")})
    </p>
  {/if}

  <div style="display:flex;gap:10px;margin-top:20px">
    <button class="sm" style="flex:1" onclick={() => (step === 1 ? dlg.close() : step--)}>{step === 1 ? "Cancelar" : "Voltar"}</button>
    {#if step < 3}
      <button class="btn" style="flex:1;height:44px" disabled={!valid} onclick={() => step++}>Seguinte</button>
    {:else}
      <button class="btn" style="flex:1;height:44px" disabled={!valid || busy} onclick={confirm}>Confirmar</button>
    {/if}
  </div>
</dialog>

<style>
  .chips { display: flex; gap: 8px; margin: 12px 0; }
  .chips button { flex: 1; height: 48px; border-radius: 12px; background: var(--tint); color: var(--pri); font-weight: 600; }
  .chips .a { background: var(--pri); color: #fff; }
</style>
