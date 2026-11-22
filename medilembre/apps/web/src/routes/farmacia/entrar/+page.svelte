<script lang="ts">
  import { goto } from "$app/navigation";
  import Icon from "$lib/Icon.svelte";
  import { api } from "$lib/api";
  import { loadPharmacy } from "$lib/pharmacy.svelte";

  let email = $state("");
  let password = $state("");
  let err = $state("");
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    err = "";
    busy = true;
    try {
      await api("/farmacia/auth/login", { method: "POST", body: { email, password } });
      await loadPharmacy();
      await goto("/farmacia", { replaceState: true });
    } catch (x) {
      err = (x as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div style="max-width:380px;margin:0 auto;padding:48px 20px">
  <div class="c" style="display:flex;justify-content:center"><div class="logo"><i><Icon name="pill" /></i>Medilembre</div></div>
  <h1 class="c" style="margin-top:22px">Painel da farmácia</h1>
  <form onsubmit={submit}>
    <label for="e">Email</label>
    <div class="in"><input id="e" type="email" bind:value={email} autocomplete="username" required /></div>
    <label for="p">Senha</label>
    <div class="in"><input id="p" type="password" bind:value={password} autocomplete="current-password" required /></div>
    {#if err}<p class="err" role="alert">{err}</p>{/if}
    <button class="btn" style="margin-top:20px" disabled={busy}>Entrar <Icon name="arrow" /></button>
  </form>
</div>
