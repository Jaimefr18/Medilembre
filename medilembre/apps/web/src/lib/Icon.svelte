<script lang="ts">
  import { icons } from "./icons";
  let { name, style = "" }: { name: string; style?: string } = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" {style}>{@html icons[name] ?? ""}</svg>
