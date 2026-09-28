<!-- Тихая плашка поверх: «Доступна новая версия», «Нет сети». Не модальная, не мигает. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { message, action }: { message: string; action?: Snippet } = $props();
</script>

<div class="banner" role="status">
  <span>{message}</span>
  {#if action}{@render action()}{/if}
</div>

<style>
  .banner {
    position: fixed;
    z-index: 100;
    inset-inline: 0;
    inset-block-end: calc(var(--space-roomy) + env(safe-area-inset-bottom));
    width: fit-content;
    max-width: calc(100% - 2 * var(--space-roomy));
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    padding: var(--space-close) var(--space-close) var(--space-close) var(--space-roomy);
    border-radius: var(--radius-circle);
    background: var(--color-glass-opaque);
    box-shadow: 0 var(--space-tight) var(--space-generous) rgb(0 0 0 / 0.18);
  }
</style>
