<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { goto } from "$app/navigation";
  import Head from "$lib/Head.svelte";
  import { api } from "$lib/api";
  import { clearLocal, session } from "$lib/session.svelte";
  import { disablePush, enablePush, pushState, type PushState } from "$lib/push";
  import { allowAlarms, alarmStatus, testAlarm, type AlarmStatus } from "$lib/local-notifications";
  import { onMount } from "svelte";
  import { showToast } from "$lib/toast.svelte";

  const isNative = Capacitor.isNativePlatform();

  let ps = $state<PushState>(pushState());
  const label: Record<PushState, string> = {
    granted: "Ativadas",
    denied: "Bloqueadas no navegador",
    default: "Ainda não ativadas",
    unsupported: "Não suportadas neste navegador",
  };

  let alarm = $state<AlarmStatus | null>(null);
  onMount(async () => {
    alarm = await alarmStatus();
  });

  async function allow() {
    await allowAlarms();
    alarm = await alarmStatus();
  }

  async function test() {
    try {
      const r = await testAlarm();
      showToast(
        r === "native" ? "O teste toca daqui a 3 segundos" : r === "web" ? "Teste enviado" : r === "denied" ? "Permita as notificações primeiro" : "Este navegador não suporta notificações",
      );
    } catch (e) {
      showToast((e as Error).message);
    }
  }

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
    <b>Toque dos lembretes</b>
    {#if alarm?.native}
      <div class="mut" style="font-size:14px;margin-top:4px">
        Notificações: {alarm.notifications === "granted" ? "permitidas" : "não permitidas"} · Alarmes exatos: {alarm.exact === "granted" ? "permitidos" : "não permitidos"}
      </div>
      {#if alarm.notifications !== "granted" || alarm.exact !== "granted"}
        <p class="mut" style="font-size:14px;margin-top:4px">Sem estas permissões o Android pode atrasar ou silenciar o alarme.</p>
        <button class="sm" style="margin-top:10px" onclick={allow}>Permitir alarmes</button>
      {/if}
    {:else}
      <p class="mut" style="font-size:14px;margin-top:4px">
        No navegador, o som é o das notificações do telemóvel: confirme que o volume de notificações não está a zero, que o modo Não incomodar está desligado e que as notificações deste site estão em "Alertar" (com som).
      </p>
    {/if}
    <button class="sm" style="margin-top:10px" onclick={test}>Testar toque</button>
  </div>

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
