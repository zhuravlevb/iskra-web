<!-- Тихая кнопка-ссылка: «У меня только логин и пароль», «Указать другой адрес». -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { onclick, disabled = false, children }: { onclick: () => void; disabled?: boolean; children: Snippet } = $props();
</script>

<button type="button" class="quiet" {disabled} {onclick}>{@render children()}</button>

<style>
  .quiet {
    min-height: var(--tap-target);
    padding: 0 var(--space-close);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
  }
  /* Наведение — только там, где указатель умеет наводиться: на телефоне тап оставлял бы «залипшую» подсветку. */
  @media (hover: hover) {
    .quiet:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .quiet:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
