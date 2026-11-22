<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "$lib/Icon.svelte";
  import { api } from "$lib/api";

  let code = $state("");
  let password = $state("");
  let err = $state("");
  let busy = $state(false);

  onMount(() => {
    const c = new URL(location.href).searchParams.get("c");
    if (c) code = c.toUpperCase();
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    err = "";
    busy = true;
    try {
      await api("/auth/reset", { method: "POST", body: { code, password } });
      sessionStorage.setItem("ml:splash", "1");
      await goto("/");
    } catch (x) {
      err = (x as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="shell">
  <div class="scr">
    <div class="c" style="display:flex;justify-content:center;margin-top:24px">
      <div class="logo"><i><Icon name="pill" /></i>Medilembre</div>
    </div>
    <div class="c">
      <h1 style="margin-top:22px">Definir nova senha</h1>
      <p class="mut" style="font-size:16px;margin-top:8px">Use o código de recuperação que a sua farmácia lhe deu.</p>
    </div>
    <form onsubmit={submit}>
      <label for="c">Código</label>
      <div class="in"><Icon name="shield" /><input id="c" bind:value={code} autocapitalize="characters" maxlength="16" required /></div>
      <label for="p">Nova senha (mínimo 8 caracteres)</label>
      <div class="in"><Icon name="lock" /><input id="p" type="password" bind:value={password} autocomplete="new-password" minlength="8" maxlength="128" required /></div>
      {#if err}<p class="err" role="alert">{err}</p>{/if}
      <button class="btn" style="margin-top:20px" disabled={busy}>Guardar e entrar <Icon name="arrow" /></button>
    </form>
    <div class="c" style="margin-top:18px"><a class="link" href="/entrar">Voltar a Entrar</a></div>
  </div>
</div>
