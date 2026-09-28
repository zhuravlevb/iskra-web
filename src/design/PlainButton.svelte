<!--
  Кнопка, которая ничего не подсказывает. Для выбора из равных — «Ввести код» / «С другого
  устройства», «Совпадают» / «Не совпадают»: подсветить одну значило бы решить за человека.
  `danger` — для необратимого («Начать заново»): красная надпись, а не красная заливка.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    onclick: () => void;
    disabled?: boolean;
    busy?: boolean;
    danger?: boolean;
    children: Snippet;
  }
  let { onclick, disabled = false, busy = false, danger = false, children }: Props = $props();
</script>

<button type="button" class="plain" class:danger disabled={disabled || busy} aria-busy={busy} {onclick}>
  {@render children()}
</button>

<style>
  .plain {
    width: 100%;
    min-height: max(var(--tap-target), var(--size-navigation-bar));
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    color: var(--color-text);
    font-weight: 600;
    cursor: pointer;
  }
  .danger {
    color: var(--color-danger);
  }
  @media (hover: hover) {
    .plain:hover:not(:disabled) {
      background: var(--color-own-reaction);
    }
  }
  .plain:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
