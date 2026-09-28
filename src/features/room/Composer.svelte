<!--
  Композер.

  Что делает `Enter`, решает указатель, а не ширина: с мышью и клавиатурой `Enter`
  отправляет, `Shift+Enter` — новая строка; на сенсорном — наоборот: `Enter` переносит
  строку, отправляет кнопка. Ноутбук с сенсорным экраном широкий, но у него есть мышь.

  «Стекло» — навигационный слой: полупрозрачность и размытие, где браузер их тянет.
-->
<script lang="ts">
  import { viewport } from '../../design/viewport.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    onsend: (text: string) => void;
    disabled?: boolean;
  }
  let { onsend, disabled = false }: Props = $props();

  let text = $state('');
  let field: HTMLTextAreaElement | undefined = $state();
  const empty = $derived(text.trim() === '');

  /** Поле растёт с текстом — до потолка, дальше прокручивается само. */
  function grow() {
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }
  $effect(() => {
    void text;
    grow();
  });

  function send() {
    if (empty || disabled) return;
    onsend(text);
    text = '';
    field?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    // Набор через IME (японский, китайский…) — Enter подтверждает слово, а не отправляет.
    if (event.key !== 'Enter' || event.isComposing) return;
    const sends = viewport.finePointer ? !event.shiftKey : false;
    if (!sends) return;
    event.preventDefault();
    send();
  }

  /** Чтобы открытый чат сразу принимал текст — на десктопе. На телефоне клавиатура не выскакивает сама. */
  export function focus() {
    if (viewport.finePointer) field?.focus();
  }
</script>

<form
  class="composer glass"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  <textarea
    bind:this={field}
    bind:value={text}
    rows="1"
    placeholder={t('room.composerPlaceholder')}
    aria-label={t('room.composerPlaceholder')}
    enterkeyhint={viewport.finePointer ? 'send' : 'enter'}
    {disabled}
    {onkeydown}
  ></textarea>
  <button type="submit" class="send" disabled={empty || disabled} aria-label={t('room.send')} title={t('room.send')}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
  </button>
</form>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    width: 100%;
    max-width: calc(var(--column-timeline-max) + 2 * var(--timeline-gutter));
    margin-inline: auto;
    padding: var(--space-close) var(--timeline-gutter);
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
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
  textarea {
    flex: 1;
    min-height: var(--size-navigation-bar);
    max-height: 40vh;
    padding: calc((var(--size-navigation-bar) - 1lh) / 2) var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-bubble);
    background: var(--color-background);
    resize: none;
    line-height: var(--line-height-body);
    overflow-y: auto;
  }
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: transparent;
  }
  .send {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
  }
  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .send svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
