<!--
  Окно с формой: нативный `<dialog>` с `showModal()` — фокус внутри, `Esc` закрывает,
  фокус возвращается туда, откуда открыли. Содержимое и кнопки — у того, кто открыл.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  }
  let { open, title, onclose, children }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" {onclose}>
  {#if open}
    <h2 id="{id}-title">{title}</h2>
    {@render children()}
  {/if}
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--size-sign-in-column));
    max-height: calc(100dvh - 2 * var(--space-roomy));
    padding: var(--space-generous);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.25);
    overflow-y: auto;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
  }
</style>
