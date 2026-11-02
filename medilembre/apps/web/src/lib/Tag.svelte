<script lang="ts">
  import Icon from "./Icon.svelte";
  let { state }: { state: "Tomado" | "Próximo" | "Agendado" } = $props();
</script>

<span class="tag" class:n={state === "Agendado"}>
  {#if state === "Tomado"}<Icon name="check" style="width:12px;height:12px;vertical-align:-1px" />{/if}
  {state}
</span>
