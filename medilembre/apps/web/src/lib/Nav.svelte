<script lang="ts">
  import { page } from "$app/state";
  import Icon from "./Icon.svelte";

  const tabs = [
    ["/", "Início", "home"],
    ["/lembretes", "Lembretes", "clock"],
    ["/reservas", "Reservas", "box"],
    ["/perfil", "Perfil", "user"],
  ] as const;
</script>

<nav aria-label="Principal">
  {#each tabs as [href, label, icon]}
    {@const active = href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href)}
    <a {href} class={active ? "a" : ""} aria-current={active ? "page" : undefined}>
      <i><Icon name={icon} /></i>{label}
    </a>
  {/each}
</nav>

<style>
  a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 13px; color: var(--mut); padding: 4px 0; text-decoration: none; }
  i { width: 56px; height: 34px; border-radius: 17px; display: grid; place-items: center; font-size: 21px; font-style: normal; }
  .a { color: var(--ink); font-weight: 600; }
  .a i { background: var(--tint); color: var(--pri); }
</style>
