<script lang="ts">
  import { addReminder } from "./data.svelte";
  import { showToast } from "./toast.svelte";

  let dlg: HTMLDialogElement;
  let name = $state("");
  let dose = $state("");
  let time = $state("12:00");
  let busy = $state(false);

  export function open() {
    name = "";
    dose = "";
    time = "12:00";
    dlg.showModal();
  }

  async function save() {
    if (!name.trim() || !time) return;
    busy = true;
    try {
      await addReminder({ name: name.trim(), dose: dose.trim(), time });
      dlg.close();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dlg}>
  <h2>Novo lembrete</h2>
  <label for="a1">Medicamento</label>
  <div class="in"><input id="a1" bind:value={name} maxlength="80" placeholder="Ex.: Paracetamol" /></div>
  <label for="a2">Dose</label>
  <div class="in"><input id="a2" bind:value={dose} maxlength="80" placeholder="Ex.: 500 mg · 1 comprimido" /></div>
  <label for="a3">Hora</label>
  <div class="in"><input id="a3" type="time" bind:value={time} /></div>
  <div style="display:flex;gap:10px;margin-top:20px">
    <button class="sm" style="flex:1" onclick={() => dlg.close()}>Cancelar</button>
    <button class="btn" style="flex:1;height:44px" disabled={busy || !name.trim()} onclick={save}>Guardar</button>
  </div>
</dialog>
