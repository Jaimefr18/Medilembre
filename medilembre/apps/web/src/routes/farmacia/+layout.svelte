<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Icon from "$lib/Icon.svelte";
  import { loadPharmacy, logoutPharmacy, pharmacy } from "$lib/pharmacy.svelte";

  let { children } = $props();
  const onLogin = $derived(page.url.pathname.startsWith("/farmacia/entrar"));
  const tabs = [
    ["/farmacia", "Clientes"],
    ["/farmacia/reservas", "Reservas"],
    ["/farmacia/produtos", "Produtos"],
  ] as const;
  const active = (href: string) => (href === "/farmacia" ? page.url.pathname === href : page.url.pathname.startsWith(href));

  onMount(async () => {
    await loadPharmacy();
    if (pharmacy.status === "out" && !onLogin) await goto("/farmacia/entrar", { replaceState: true });
  });

  async function sair() {
    await logoutPharmacy();
    await goto("/farmacia/entrar", { replaceState: true });
  }
</script>

<div class="fx">
  {#if onLogin}
    {@render children()}
  {:else if pharmacy.status === "in"}
    <header>
      <div class="logo"><i><Icon name="pill" /></i>{pharmacy.name || "Farmácia"}</div>
      <nav aria-label="Painel">
        {#each tabs as [href, label]}
          <a {href} class:a={active(href)} aria-current={active(href) ? "page" : undefined}>{label}</a>
        {/each}
      </nav>
      <button class="sm" onclick={sair}>Sair</button>
    </header>
    <main>{@render children()}</main>
  {:else}
    <p class="mut" style="padding:48px;text-align:center">A carregar…</p>
  {/if}
</div>

<style>
  .fx { width: 100%; height: 100dvh; overflow-y: auto; background: var(--bg); }
  header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 12px 20px; background: var(--card); border-bottom: 1px solid var(--line); }
  header .logo { font-size: 18px; margin-right: auto; }
  nav { display: flex; gap: 4px; }
  nav a { padding: 8px 14px; border-radius: 10px; color: var(--mut); text-decoration: none; font-size: 16px; }
  nav a.a { background: var(--tint); color: var(--pri); font-weight: 600; }
  header .sm { height: 38px; }
  main { max-width: 960px; margin: 0 auto; padding: 20px; }
</style>
