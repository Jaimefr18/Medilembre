<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { goto } from "$app/navigation";
  import Head from "$lib/Head.svelte";
  import { api } from "$lib/api";
  import { clearLocal, session } from "$lib/session.svelte";
  import { disablePush, enablePush, pushState, type PushState } from "$lib/push";
  import { showToast } from "$lib/toast.svelte";

  const isNative = Capacitor.isNativePlatform();

  let ps = $state<PushState>(pushState());
  const label: Record<PushState, string> = {
    granted: "Ativadas",
    denied: "Bloqueadas no navegador",
    default: "Ainda não ativadas",
    unsupported: "Não suportadas neste navegador",
  };

  async function activate() {
    try {
      ps = await enablePush();
      showToast(ps === "granted" ? "Notificações ativadas" : "Notificações não ativadas");
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function logout() {
    await disablePush();
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    clearLocal();
    await goto("/entrar", { replaceState: true });
  }

  async function exportData() {
    try {
      const d = await api("/me/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
      a.download = "medilembre-os-meus-dados.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function erase() {
    if (!confirm("Apagar a sua conta e os seus lembretes? Esta ação não pode ser desfeita.")) return;
    try {
      await disablePush();
      await api("/me", { method: "DELETE" });
      clearLocal();
      await goto("/entrar", { replaceState: true });
    } catch (e) {
      showToast((e as Error).message);
    }
  }
</script>

<div class="scr">
  <Head />
  <h1 style="font-size:32px">Perfil</h1>
  <p class="mut" style="font-size:16px">{session.name}</p>

  {#if !isNative}
    <div class="box">
      <div class="row">
        <div><b>Notificações</b><div class="mut" style="font-size:14px">{label[ps]}</div></div>
        <button class="sm" onclick={activate} disabled={ps === "granted" || ps === "unsupported"}>Ativar</button>
      </div>
    </div>
  {/if}

  <div class="box">
    <b>Privacidade</b>
    <p class="mut" style="font-size:14px;margin-top:4px">
      Os seus dados de medicação só são usados para os lembretes e são partilhados apenas com a sua farmácia.
      Pode exportar ou apagar tudo a qualquer momento.
    </p>
    <div class="row" style="margin-top:12px;gap:10px">
      <button class="sm" onclick={exportData}>Exportar dados</button>
      <button class="sm" onclick={erase}>Apagar conta</button>
    </div>
  </div>

  <button class="add" style="margin-top:20px" onclick={logout}>Sair</button>
</div>
