<!--
  Главная кнопка экрана: заливка — акцент, надпись — `--on-accent`, и только так.
  Урок нативной Искры: при монохромном акценте «основной цвет» на «основном цвете» —
  белая плашка с белой надписью в тёмной теме.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { onclick, children }: { onclick: () => void; children: Snippet } = $props();
</script>

<button type="button" class="primary" {onclick}>{@render children()}</button>

<style>
  .primary {
    min-height: var(--tap-target);
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    cursor: pointer;
  }
</style>
