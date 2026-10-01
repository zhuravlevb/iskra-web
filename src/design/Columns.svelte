<!--
  Раскладка колонок в три ширины.

  | < 640     | стек: список → чат; правая панель — лист поверх всего          |
  | 640–1100  | две колонки: список и чат; правая панель — лист поверх чата   |
  | ≥ 1100    | три колонки: правая панель сдвигает чат, а не перекрывает его |

  Ширина списка меняется перетаскиванием границы (и стрелками с клавиатуры, когда
  граница в фокусе), двойной клик возвращает по умолчанию. Хранить её — забота того,
  кто держит `listWidth`: здесь только раскладка.

  Никакого Matrix и никаких строк: подписи приходят снаружи уже переведёнными.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { viewport } from './viewport.svelte.ts';
  import { LIST_IDEAL, LIST_MAX, LIST_MIN, clampListWidth as clamp } from './columns';

  interface Props {
    list: Snippet;
    main: Snippet;
    panel?: Snippet;
    /** Ширина списка в rem. */
    listWidth?: number;
    /** Открыт ли чат — на стеке решает, какая колонка на экране. */
    showMain: boolean;
    panelOpen?: boolean;
    onClosePanel?: () => void;
    /** Подпись границы для скринридера, например «Ширина списка чатов». */
    resizeLabel: string;
  }

  let {
    list,
    main,
    panel,
    listWidth = $bindable(LIST_IDEAL),
    showMain,
    panelOpen = false,
    onClosePanel,
    resizeLabel,
  }: Props = $props();

  const layout = $derived(viewport.layout);
  const panelAsSheet = $derived(layout !== 'three');

  function remInPx(): number {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartWidth = 0;

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    dragging = true;
    dragStartX = event.clientX;
    dragStartWidth = listWidth;
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const deltaRem = (event.clientX - dragStartX) / remInPx();
    listWidth = clamp(dragStartWidth + deltaRem);
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 2 : 1;
    const next =
      event.key === 'ArrowLeft' ? listWidth - step
      : event.key === 'ArrowRight' ? listWidth + step
      : event.key === 'Home' ? LIST_MIN
      : event.key === 'End' ? LIST_MAX
      : null;
    if (next === null) return;
    event.preventDefault();
    listWidth = clamp(next);
  }
</script>

<div
  class="columns"
  data-layout={layout}
  data-show-main={showMain}
  data-panel-open={panelOpen && !!panel}
  class:dragging
  style:--list-width="{listWidth}rem"
>
  <section class="list">
    {@render list()}
  </section>

  {#if layout !== 'stack'}
    <!-- Фокусируемый separator со значением — виджет по ARIA; Svelte этого не различает. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={resizeLabel}
      aria-valuemin={LIST_MIN}
      aria-valuemax={LIST_MAX}
      aria-valuenow={listWidth}
      tabindex="0"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      ondblclick={() => (listWidth = LIST_IDEAL)}
      onkeydown={onKeyDown}
    ></div>
  {/if}

  <section class="main">
    {@render main()}
  </section>

  {#if panel && panelOpen}
    {#if panelAsSheet}
      <!-- Скрим — только указатель; с клавиатуры лист закрывает Esc. -->
      <div class="scrim" aria-hidden="true" onclick={() => onClosePanel?.()}></div>
    {/if}
    <aside class="panel" class:sheet={panelAsSheet}>
      {@render panel()}
    </aside>
  {/if}
</div>

<style>
  .columns {
    position: relative;
    display: grid;
    height: 100%;
    max-width: var(--column-app-max);
    margin-inline: auto;
    overflow: hidden;
  }

  section,
  aside {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* Стек: одна колонка на экране. */
  .columns[data-layout='stack'] {
    grid-template-columns: 100%;
  }
  .columns[data-layout='stack'][data-show-main='true'] .list,
  .columns[data-layout='stack'][data-show-main='false'] .main {
    display: none;
  }

  /* Две и три колонки: граница между списком и чатом — полоска в 1px с зоной захвата шире. */
  .columns[data-layout='two'] {
    grid-template-columns: var(--list-width) 0 minmax(0, 1fr);
  }
  .columns[data-layout='three'] {
    grid-template-columns: var(--list-width) 0 minmax(0, 1fr);
  }
  .columns[data-layout='three'][data-panel-open='true'] {
    grid-template-columns: var(--list-width) 0 minmax(0, 1fr) var(--column-panel);
  }

  .list {
    background: var(--color-surface);
  }

  /* Строка заголовка окна (titlebar.css): отступ от кнопок окна — только крайним колонкам.
     Слева — всегда список; справа — панель, если она стоит колонкой, иначе чат. Лист панели
     лежит поверх правого края, ему — тоже. На стеке колонка одна — ей обе стороны. */
  .list {
    --bar-inset-start: var(--titlebar-start);
  }
  .main,
  .panel {
    --bar-inset-end: var(--titlebar-end);
  }
  .columns[data-layout='three'][data-panel-open='true'] .main {
    --bar-inset-end: 0px;
  }
  .columns[data-layout='stack'] .list {
    --bar-inset-end: var(--titlebar-end);
  }
  .columns[data-layout='stack'] .main,
  .columns[data-layout='stack'] .panel {
    --bar-inset-start: var(--titlebar-start);
  }

  .resize {
    position: relative;
    z-index: 2;
    width: 0;
    border-inline-start: var(--border-hairline) solid var(--color-separator);
    touch-action: none;
  }
  .resize::after {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline: calc(-1 * var(--space-tight));
    cursor: col-resize;
  }
  .resize:hover,
  .resize:focus-visible,
  .dragging .resize {
    border-inline-start-color: var(--accent);
  }
  .dragging {
    cursor: col-resize;
    user-select: none;
  }

  .panel:not(.sheet) {
    border-inline-start: var(--border-hairline) solid var(--color-separator);
  }

  .scrim {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }

  .panel.sheet {
    position: absolute;
    z-index: 11;
    inset-block: 0;
    inset-inline-end: 0;
    width: min(100%, var(--column-panel));
    background: var(--color-background);
    box-shadow: 0 0 var(--space-generous) rgb(0 0 0 / 0.2);
  }
  .columns[data-layout='stack'] .panel.sheet {
    width: 100%;
  }
</style>
