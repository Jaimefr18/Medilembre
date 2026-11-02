<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import Icon from "./Icon.svelte";
  import { enablePush } from "./push";
  import { showToast } from "./toast.svelte";

  const isNative = Capacitor.isNativePlatform();

  async function bell() {
    try {
      const s = await enablePush();
      showToast(
        s === "granted" ? "Notificações ativadas" : s === "unsupported" ? "Este navegador não suporta notificações" : "Notificações não ativadas",
      );
    } catch (e) {
      showToast((e as Error).message);
    }
  }
</script>

<div class="top">
  <div class="logo"><i><Icon name="pill" /></i>Medilembre</div>
  {#if !isNative}
    <button class="bell" aria-label="Ativar notificações" onclick={bell}><Icon name="bell" /></button>
  {/if}
</div>
