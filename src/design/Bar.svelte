<!--
  Шапка колонки. «Стекло» — только в навигационном слое, и это он: полупрозрачность и
  размытие, если браузер их тянет, иначе непрозрачная заливка.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    leading?: Snippet;
    title: string;
    trailing?: Snippet;
  }
  let { leading, title, trailing }: Props = $props();
</script>

<header class="bar glass">
  <div class="side">{#if leading}{@render leading()}{/if}</div>
  <h1>{title}</h1>
  <div class="side end">{#if trailing}{@render trailing()}{/if}</div>
</header>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-close);
    min-height: var(--size-navigation-bar);
    padding: var(--space-tight) var(--space-close);
    /* Вырез и статус-бар телефона: viewport-fit=cover отдаёт нам весь экран. */
    padding-block-start: max(var(--space-tight), env(safe-area-inset-top));
    padding-inline: max(var(--space-close), env(safe-area-inset-left)) max(var(--space-close), env(safe-area-inset-right));
    border-block-end: var(--border-hairline) solid var(--color-separator);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .side {
    display: flex;
    gap: var(--space-tight);
  }
  .glass {
    background: var(--color-glass-opaque);
  }
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .glass {
      background: var(--color-glass);
      -webkit-backdrop-filter: saturate(180%) blur(var(--backdrop-blur));
      backdrop-filter: saturate(180%) blur(var(--backdrop-blur));
    }
  }
</style>
