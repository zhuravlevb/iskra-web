<!--
  Справка по клавишам — `?` или `Ctrl/⌘ /`. Строится из той же таблицы, что и обработка
  (`design/hotkeys.ts`): сочетание, которого нет в справке, не может работать, и наоборот.
  `Ctrl` или `⌘` — по платформе.
-->
<script lang="ts">
  import { describe, hotkeys } from '../../design/hotkeys';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();
  const rows = hotkeys.filter((h) => !h.planned);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" {onclose}>
  <h2 id="{id}-title">{t('hotkeys.title')}</h2>
  <dl>
    {#each rows as hotkey (hotkey.id)}
      <dt>
        {#each hotkey.chords as chord, i (i)}<kbd>{describe(chord)}</kbd>{/each}
      </dt>
      <dd>{t(`hotkey.${hotkey.id}` as TextKey)}</dd>
    {/each}
  </dl>
  <button type="button" onclick={onclose}>{t('hotkeys.close')}</button>
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--column-timeline-max));
    padding: var(--space-generous);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  h2 {
    margin: 0 0 var(--space-roomy);
    font-size: var(--font-size-title);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-close) var(--space-roomy);
    margin: 0 0 var(--space-generous);
  }
  dt {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-tight);
    justify-content: flex-end;
  }
  dd {
    margin: 0;
    color: var(--color-text-secondary);
  }
  kbd {
    padding: var(--space-within-run) var(--space-close);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    font-family: var(--font-code);
    font-size: var(--font-size-caption);
    white-space: nowrap;
  }
  button {
    display: block;
    min-height: var(--tap-target);
    margin-inline-start: auto;
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    cursor: pointer;
  }
</style>
