<script lang="ts">
  import "../app.css";
  import Toast from "$lib/Toast.svelte";
  let { children } = $props();
</script>

{@render children()}
<Toast />
