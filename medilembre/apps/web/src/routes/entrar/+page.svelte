<script lang="ts">
  import { goto } from "$app/navigation";
  import Icon from "$lib/Icon.svelte";
  import { api } from "$lib/api";
  import { showToast } from "$lib/toast.svelte";

  let identifier = $state("");
  let password = $state("");
  let show = $state(false);
  let err = $state("");
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    err = "";
    busy = true;
    try {
      await api("/auth/login", { method: "POST", body: { identifier, password } });
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
    <div class="hero">
      <div class="card">
        <b><Icon name="clock" />Hora de se cuidar</b>
        <div class="bar" style="width:80%"></div>
        <div class="bar" style="width:55%;height:6px"></div>
      </div>
    </div>
    <div class="c">
      <h1 style="margin-top:14px">Que bom ter você aqui</h1>
      <p class="mut" style="font-size:16px;margin-top:8px">Entre para cuidar da sua rotina,<br />um lembrete de cada vez.</p>
    </div>

    <form onsubmit={submit}>
      <label for="u">Número de telemóvel ou email</label>
      <div class="in"><Icon name="phone" /><input id="u" bind:value={identifier} autocomplete="username" inputmode="email" placeholder="Número de telemóvel ou email" required /></div>
      <label for="p">Senha</label>
      <div class="in">
        <Icon name="lock" />
        <input id="p" type={show ? "text" : "password"} bind:value={password} autocomplete="current-password" placeholder="Sua senha" required />
        <button type="button" aria-label="Mostrar senha" onclick={() => (show = !show)}><Icon name="eye" /></button>
      </div>
      <div style="text-align:right;margin:14px 0 18px">
        <button type="button" class="link" onclick={() => showToast("Peça a recuperação à sua farmácia")}>Esqueci minha senha</button>
      </div>
      {#if err}<p class="err" role="alert">{err}</p>{/if}
      <button class="btn" disabled={busy}>Entrar <Icon name="arrow" /></button>
    </form>

    <p class="c mut" style="font-size:15px;margin-top:22px">Ainda não tem uma conta?</p>
    <div class="c"><a class="link" style="font-size:18px;margin-top:4px;display:inline-block" href="/ativar">Criar minha conta</a></div>
    <div class="safe"><Icon name="shield" />Seus dados tratados com segurança.</div>
  </div>
</div>
