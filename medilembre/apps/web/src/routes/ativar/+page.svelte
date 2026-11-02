<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { tick } from "svelte";
  import Icon from "$lib/Icon.svelte";
  import { api } from "$lib/api";

  let code = $state("");
  let identifier = $state("");
  let password = $state("");
  let err = $state("");
  let busy = $state(false);
  let scanning = $state(false);
  let scanner: { stop(): Promise<void>; clear(): void } | null = null;

  /** O QR pode conter só o código ou um link com ?c=CODIGO. */
  function parse(text: string) {
    try {
      return new URL(text).searchParams.get("c") ?? text;
    } catch {
      return text;
    }
  }

  onMount(() => {
    const c = new URL(location.href).searchParams.get("c");
    if (c) code = c.toUpperCase();
    return stop;
  });

  async function start() {
    err = "";
    scanning = true;
    await tick();
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const s = new Html5Qrcode("qr-reader");
      scanner = s;
      await s.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          code = parse(text).toUpperCase();
          stop();
        },
        () => {},
      );
    } catch {
      err = "Não foi possível abrir a câmara. Escreva o código manualmente.";
      await stop();
    }
  }

  async function stop() {
    const s = scanner;
    scanner = null;
    scanning = false;
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {}
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    err = "";
    busy = true;
    try {
      await api("/auth/activate", { method: "POST", body: { code, identifier, password } });
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
      <h1 style="margin-top:22px">Criar a sua conta</h1>
      <p class="mut" style="font-size:16px;margin-top:8px">Use o código que a sua farmácia lhe deu.</p>
    </div>

    {#if scanning}
      <div id="qr-reader"></div>
      <button class="add" style="margin-bottom:0" onclick={stop}>Cancelar</button>
    {:else}
      <button class="add" onclick={start}>Escanear QR da farmácia</button>
    {/if}

    <form onsubmit={submit}>
      <label for="c">Código</label>
      <div class="in"><Icon name="shield" /><input id="c" bind:value={code} autocapitalize="characters" maxlength="16" placeholder="Ex.: 8F72KQ" required /></div>
      <label for="u">Número de telemóvel ou email</label>
      <div class="in"><Icon name="phone" /><input id="u" bind:value={identifier} autocomplete="username" placeholder="Número de telemóvel ou email" required /></div>
      <label for="p">Senha (mínimo 8 caracteres)</label>
      <div class="in"><Icon name="lock" /><input id="p" type="password" bind:value={password} autocomplete="new-password" minlength="8" maxlength="128" required /></div>
      {#if err}<p class="err" role="alert">{err}</p>{/if}
      <button class="btn" style="margin-top:20px" disabled={busy}>Criar conta <Icon name="arrow" /></button>
    </form>

    <div class="c" style="margin-top:18px"><a class="link" href="/entrar">Já tenho conta</a></div>
    <div class="safe"><Icon name="shield" />Seus dados tratados com segurança.</div>
  </div>
</div>
