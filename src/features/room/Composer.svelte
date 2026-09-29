<!--
  Композер.

  Что делает `Enter`, решает указатель, а не ширина: с мышью и клавиатурой `Enter`
  отправляет, `Shift+Enter` — новая строка; на сенсорном — наоборот: `Enter` переносит
  строку, отправляет кнопка. Ноутбук с сенсорным экраном широкий, но у него есть мышь.

  Над полем — полоса ответа или правки. `Esc` её убирает, `↑` в пустом поле берёт в правку
  последнее своё сообщение. Текст и полосу держит `RoomView` (черновик, «печатает»);
  композер только показывает и сообщает.

  «Стекло» — навигационный слой: полупрозрачность и размытие, где браузер их тянет.
-->
<script lang="ts">
  import Menu from '../../design/Menu.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import type { OutgoingFile } from '../../core/media/upload';
  import AttachmentTray from '../media/AttachmentTray.svelte';
  import type { ComposerContext } from './actions';
  import { attachmentLabel } from './text';

  interface Props {
    text: string;
    context: ComposerContext;
    onsend: (text: string) => void;
    /** Человек что-то набрал или стёр — не программная подстановка черновика. */
    oninput?: (text: string) => void;
    oncancelcontext: () => void;
    /** `↑` в пустом поле. `true` — нашлось, что править. */
    oneditlast: () => boolean;
    /** Вложения к отправке — их держит `RoomView`. */
    attachments?: OutgoingFile[];
    /** Выбрали, вставили или перетащили файлы. */
    onfiles?: (files: File[]) => void;
    onremoveattachment?: (index: number) => void;
    /** «Геопозиция» в меню скрепки. */
    onlocation?: () => void;
    disabled?: boolean;
  }
  let {
    text = $bindable(''),
    context,
    onsend,
    oninput,
    oncancelcontext,
    oneditlast,
    attachments = [],
    onfiles,
    onremoveattachment,
    onlocation,
    disabled = false,
  }: Props = $props();

  /** Меню скрепки — как «+» нативной Искры: фото, файл, место. */
  let attachMenu = $state<{ x: number; y: number } | null>(null);

  function openAttachMenu(event: MouseEvent) {
    if (!canAttach) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    attachMenu = { x: rect.left, y: rect.top };
  }

  /** Пункт меню: закрыть — и выбрать. Фото — с фильтром, файл — любой. */
  function choose(accept: string) {
    attachMenu = null;
    if (picker) picker.accept = accept;
    picker?.click();
  }

  let field: HTMLTextAreaElement | undefined = $state();
  let picker: HTMLInputElement | undefined = $state();
  // С вложением можно отправить и без текста: текст тогда — подпись, а её может не быть.
  const empty = $derived(text.trim() === '' && attachments.length === 0);
  /** При правке вложений не бывает: меняется только текст. */
  const canAttach = $derived(!!onfiles && context?.kind !== 'edit' && !disabled);

  /** Одна строка о том, на что отвечаем или что правим. */
  const quote = $derived.by(() => {
    const kind = context?.message.kind;
    if (!kind) return '';
    if ('body' in kind) return kind.body.split('\n')[0] ?? '';
    if (kind.type === 'poll') return kind.poll.question;
    return attachmentLabel(kind);
  });

  // Взяли в правку или начали отвечать — поле в фокусе, курсор в конце. Кадром позже:
  // закрывающееся меню (`<dialog>`) возвращает фокус туда, откуда его открыли, и сделало
  // бы это после нас.
  $effect(() => {
    if (!context || !field) return;
    const target = field;
    const frame = requestAnimationFrame(() => {
      target.focus();
      const end = target.value.length;
      target.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(frame);
  });

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
    field?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && context) {
      // Своё `Esc` — убрать полосу; до «закрыть верхнее» уровня приложения не доходит.
      event.preventDefault();
      event.stopPropagation();
      oncancelcontext();
      return;
    }
    if (event.key === 'ArrowUp' && text === '' && !context && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      if (oneditlast()) event.preventDefault();
      return;
    }
    // Набор через IME (японский, китайский…) — Enter подтверждает слово, а не отправляет.
    if (event.key !== 'Enter') return;
    const sends = viewport.finePointer ? !event.shiftKey : false;
    if (!sends) return;
    event.preventDefault();
    send();
  }

  /** `Ctrl/⌘ Shift U` — сразу выбор файла, мимо меню: сочетание клавиш не переспрашивает. */
  export function attach() {
    if (!canAttach) return;
    if (picker) picker.accept = '';
    picker?.click();
  }

  /** Вставка из буфера: файлы — во вложения, текст — как обычно. */
  function onpaste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length || !canAttach) return;
    event.preventDefault();
    onfiles?.(files);
  }

  function picked() {
    const files = [...(picker?.files ?? [])];
    if (files.length) onfiles?.(files);
    if (picker) picker.value = '';
  }

  /** Чтобы открытый чат сразу принимал текст — на десктопе. На телефоне клавиатура не выскакивает сама. */
  export function focus() {
    if (viewport.finePointer) field?.focus();
  }
</script>

<div class="composer glass">
{#if context}
  <div class="context">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if context.kind === 'reply'}<path d="M10 7L4 12l6 5M4 12h11a5 5 0 0 1 5 5v1" />{:else}<path d="M4 20h4L19 9l-4-4L4 16v4z" />{/if}
    </svg>
    <span class="what">
      <span class="title">
        <strong>{context.kind === 'reply' ? t('room.replyingTo') : t('room.editingMessage')}</strong>
        {#if context.kind === 'reply'}<span class="who">{context.message.senderName}</span>{/if}
      </span>
      <span class="quote">{quote}</span>
    </span>
    <button type="button" class="cancel" aria-label={t('room.stopReplying')} title={t('room.stopReplying')} onclick={oncancelcontext}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>
{/if}
{#if attachments.length && onremoveattachment}
  <AttachmentTray files={attachments} onremove={onremoveattachment} />
{/if}
<form
  class="row"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  {#if onfiles}
    <button type="button" class="attach" disabled={!canAttach} aria-label={t('room.attach')} title={t('room.attach')} aria-haspopup="menu" onclick={openAttachMenu}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7" /></svg>
    </button>
    <input bind:this={picker} type="file" multiple hidden onchange={picked} />
  {/if}
  <textarea
    bind:this={field}
    bind:value={text}
    rows="1"
    placeholder={t('room.composerPlaceholder')}
    aria-label={t('room.composerPlaceholder')}
    enterkeyhint={viewport.finePointer ? 'send' : 'enter'}
    {disabled}
    {onkeydown}
    {onpaste}
    oninput={() => oninput?.(text)}
  ></textarea>
  <button type="submit" class="send" disabled={empty || disabled} aria-label={t('room.send')} title={t('room.send')}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
  </button>
</form>

<Menu open={!!attachMenu} x={attachMenu?.x ?? 0} y={attachMenu?.y ?? 0} sheet={!viewport.finePointer} label={t('room.attach')} onclose={() => (attachMenu = null)}>
  <button type="button" role="menuitem" onclick={() => choose('image/*,video/*')}>{t('room.attachPhoto')}</button>
  <button type="button" role="menuitem" onclick={() => choose('')}>{t('room.attachFile')}</button>
  {#if onlocation}
    <button
      type="button"
      role="menuitem"
      onclick={() => {
        attachMenu = null;
        onlocation?.();
      }}>{t('location.attach')}</button
    >
  {/if}
</Menu>
</div>

<style>
  .composer {
    width: 100%;
    padding: var(--space-close) var(--timeline-gutter);
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
  }
  .row,
  .context {
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    max-width: var(--column-timeline-max);
    margin-inline: auto;
  }
  .context {
    align-items: center;
    margin-block-end: var(--space-close);
    padding-inline-start: var(--space-close);
    color: var(--accent);
  }
  .context > svg,
  .cancel svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .what {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    padding-inline-start: var(--space-close);
    border-inline-start: 2px solid currentColor;
    font-size: var(--font-size-caption);
  }
  .title {
    display: flex;
    gap: var(--space-tight);
  }
  .who {
    font-weight: 600;
    color: var(--color-text);
  }
  .quote {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }
  .cancel {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--tap-target);
    height: var(--tap-target);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
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
  .attach {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .attach:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .attach svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
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
