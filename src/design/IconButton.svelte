<!--
  Кнопка-иконка. Подпись обязательна: она же `aria-label` и тултип — у каждой
  иконки-кнопки подпись из тех же переводов.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    label: string;
    /** Сочетание клавиш для тултипа, уже в виде для этой платформы: «Ctrl K» или «⌘K». */
    shortcut?: string;
    pressed?: boolean;
    onclick: () => void;
    children: Snippet;
  }
  let { label, shortcut, pressed, onclick, children }: Props = $props();
</script>

<button
  type="button"
  class="icon-button"
  aria-label={label}
  aria-pressed={pressed}
  title={shortcut ? `${label} (${shortcut})` : label}
  {onclick}
>
  {@render children()}
</button>

<style>
  .icon-button {
    display: inline-grid;
    place-items: center;
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    padding: 0;
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
  }
  .icon-button:hover {
    background: var(--color-incoming-bubble);
  }
  .icon-button[aria-pressed='true'] {
    background: var(--color-own-reaction);
  }
  .icon-button :global(svg) {
    width: 1.375rem;
    height: 1.375rem;
  }
</style>
