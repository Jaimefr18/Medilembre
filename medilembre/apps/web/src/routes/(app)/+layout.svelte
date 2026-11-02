<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "$lib/Icon.svelte";
  import Nav from "$lib/Nav.svelte";
  import { loadAll } from "$lib/data.svelte";
  import { loadSession, session } from "$lib/session.svelte";
  import { setupAlarms } from "$lib/local-notifications";

  let { children } = $props();
  let splash = $state(false);

  onMount(async () => {
    splash = sessionStorage.getItem("ml:splash") === "1";
    const minSplash = new Promise((r) => setTimeout(r, splash ? 1500 : 0));
    await loadSession();
    if (session.status === "out") return goto("/entrar", { replaceState: true });
    await Promise.all([loadAll(), minSplash, setupAlarms()]);
    sessionStorage.removeItem("ml:splash");
    splash = false;
  });
</script>

<div class="shell">
  {#if session.status !== "in" || splash}
    <div class="scr splash" style="display:flex;flex-direction:column;align-items:center;padding-bottom:20px">
      <div class="logo" style="margin-top:6px"><i><Icon name="pill" /></i>Medilembre</div>
      <div class="arc"><div class="c"><Icon name="pill" /><br />Bem-vindo</div></div>
      <b style="color:var(--pri);font-size:17px">Preparando seus lembretes</b>
      <p class="c mut" style="font-size:16px;margin-top:8px">Estamos organizando sua rotina<br />de cuidado. Só um instante.</p>
      <div class="safe" style="margin-top:auto"><Icon name="shield" />Seus dados tratados com segurança.</div>
    </div>
  {:else}
    {@render children()}
    <Nav />
  {/if}
</div>
