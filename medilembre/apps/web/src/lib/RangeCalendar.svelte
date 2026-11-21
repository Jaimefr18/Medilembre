<script lang="ts">
  let { start = $bindable(""), end = $bindable("") }: { start: string; end: string } = $props();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const today = ymd(now);
  let cursor = $state(new Date(now.getFullYear(), now.getMonth(), 1));
  let picking = $state(false);

  const label = $derived(new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(cursor));
  const atCurrent = $derived(cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth());
  const cells = $derived.by(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // segunda = 0
    const days = new Date(y, m + 1, 0).getDate();
    return [...Array<string | null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(y, m, i + 1)))];
  });

  function tap(d: string) {
    if (d < today) return;
    if (!picking) {
      start = end = d;
      picking = true;
    } else {
      if (d < start) {
        end = start;
        start = d;
      } else {
        end = d;
      }
      picking = false;
    }
  }
  const move = (n: number) => (cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
</script>

<div class="cal">
  <div class="hd">
    <button disabled={atCurrent} onclick={() => move(-1)} aria-label="Mês anterior">‹</button>
    <b style="text-transform:capitalize">{label}</b>
    <button onclick={() => move(1)} aria-label="Mês seguinte">›</button>
  </div>
  <div class="g">
    {#each ["S", "T", "Q", "Q", "S", "S", "D"] as w}<span class="w">{w}</span>{/each}
    {#each cells as d}
      {#if d}
        <button
          class:in={start && d >= start && d <= end}
          class:edge={d === start || d === end}
          disabled={d < today}
          onclick={() => tap(d)}
        >{+d.slice(8)}</button>
      {:else}<span></span>{/if}
    {/each}
  </div>
  <p class="mut" style="font-size:13px;margin-top:8px">
    {start ? `${start}${end && end !== start ? " → " + end : ""}` : "Toque no dia de início e depois no de fim."}
  </p>
</div>

<style>
  .hd { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
  .hd button { width: 40px; height: 40px; font-size: 22px; }
  .g { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
  .w { font-size: 12px; color: var(--mut); }
  .g button { height: 40px; border-radius: 10px; }
  .g button:disabled { opacity: 0.3; }
  .g .in { background: var(--tint); }
  .g .edge { background: var(--pri); color: #fff; }
</style>
