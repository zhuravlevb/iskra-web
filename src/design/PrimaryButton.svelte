<!--
  Главная кнопка экрана: заливка — акцент, надпись — `--on-accent`, и только так.
  Урок нативной Искры: при монохромном акценте «основной цвет» на «основном цвете» —
  белая плашка с белой надписью в тёмной теме.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    onclick?: () => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
    /** Идёт работа: кнопка не нажимается, скринридер слышит «занято». */
    busy?: boolean;
    wide?: boolean;
    children: Snippet;
  }
  let { onclick, type = 'button', disabled = false, busy = false, wide = false, children }: Props = $props();
</script>

<button {type} class="primary" class:wide disabled={disabled || busy} aria-busy={busy} {onclick}>
  {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
  {@render children()}
</button>

<style>
  .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-close);
    min-height: var(--tap-target);
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    cursor: pointer;
  }
  .wide {
    width: 100%;
    min-height: max(var(--tap-target), var(--size-navigation-bar));
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary[aria-busy='true'] {
    opacity: 0.8;
  }
  .spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-inline-end-color: transparent;
    border-radius: var(--radius-circle);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
</style>
