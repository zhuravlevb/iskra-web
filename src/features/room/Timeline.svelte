<!--
  Лента: прокрутка с якорем (`design/scrollAnchor.svelte.ts`), явная подгрузка истории под
  высоту окна и прочитанное — когда чат на экране и человек внизу.

  `role="log"` для скринридера — с `aria-live="off"`: иначе он зачитал бы каждую страницу
  подгруженной истории. Новые входящие объявляет отдельная вежливая область.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import { ScrollAnchor } from '../../design/scrollAnchor.svelte.ts';
  import { dayLabel } from '../../design/time';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import MessageRow from './MessageRow.svelte';

  interface Props {
    store: TimelineStore;
    session: UserSession;
    showSenders: boolean;
  }
  let { store, session, showSenders }: Props = $props();

  let container: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();
  let anchor: ScrollAnchor | undefined = $state();
  let announcement = $state('');
  let now = $state(Date.now());

  /** Theme.Size.paginationReach и newestReach. */
  const TOP_REACH = 400;
  const BOTTOM_REACH = 80;

  onMount(() => {
    const a = new ScrollAnchor(container!, content!, {
      topReach: TOP_REACH,
      bottomReach: BOTTOM_REACH,
      onNearTop: () => void store.loadMore(),
    });
    anchor = a;
    // Открытие: история просится явно, пока содержимого меньше, чем окно.
    void store.fill(() => a.needsMore());
    // Окно выросло после открытия — развернули на весь экран — подгрузка продолжается.
    const grow = new ResizeObserver(() => {
      if (a.needsMore()) void store.fill(() => a.needsMore());
    });
    grow.observe(container!);
    const tick = setInterval(() => (now = Date.now()), 60_000);
    return () => {
      grow.disconnect();
      a.destroy();
      clearInterval(tick);
    };
  });

  // Прочитано: чат на экране, окно в фокусе, человек внизу.
  function maybeMarkRead() {
    if (anchor?.atBottom && document.visibilityState === 'visible' && document.hasFocus()) store.markRead();
  }
  $effect(() => {
    void store.messages;
    void anchor?.atBottom;
    maybeMarkRead();
  });

  // Объявить новое входящее — только то, что пришло снизу, а не подгруженную историю.
  let lastKey: string | undefined;
  $effect(() => {
    const last = store.messages.at(-1);
    if (last && lastKey && last.key !== lastKey && !last.own && last.kind.type === 'text') {
      announcement = t('room.announce', { name: last.senderName, text: last.kind.body });
    }
    lastKey = last?.key;
  });

  // Кэш фото отправителей на время жизни ленты; реактивен сам `Photo`, а не словарь.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const faces = new Map<string, Photo>();
  function photoOf(userId: string, mxc: string | undefined): string | undefined {
    if (!mxc) return undefined;
    const key = `${userId}|${mxc}`;
    let photo = faces.get(key);
    if (!photo) {
      photo = new Photo(session, mxc, pixelsFor(1.75));
      faces.set(key, photo);
    }
    return photo.url;
  }
</script>

<svelte:window onfocus={maybeMarkRead} />
<svelte:document onvisibilitychange={maybeMarkRead} />

<div class="timeline">
<div class="scroller" bind:this={container}>
  <div class="content" bind:this={content} role="log" aria-live="off" aria-label={t('room.timeline')}>
    {#if store.loadingMore}
      <p class="loading" role="status">{t('room.loadingHistory')}</p>
    {/if}
    {#if store.loadFailed}
      <div class="problem">
        <EmptyState title={t('room.loadFailedTitle')} message={t('room.loadFailedMessage')} />
        <PrimaryButton onclick={() => void store.retryOpen(() => anchor?.needsMore() ?? true)}>{t('room.tryAgain')}</PrimaryButton>
      </div>
    {:else if store.atStart && store.messages.every((m) => m.kind.type === 'service')}
      <EmptyState title={t('room.emptyTitle')} message={t('room.emptyMessage')} />
    {/if}
    {#each store.items as item (item.key)}
      <!-- Якорь — только сообщения. Разделитель дня — нет: подгруженная история того же дня
           встаёт под него, и он остаётся на месте, пока всё под ним уезжает. -->
      <div class="item" data-anchor={item.kind === 'message' ? item.key : undefined}>
        {#if item.kind === 'day'}
          <p class="day"><span>{dayLabel(item.ts, now, i18n.locale, t('room.today'), t('room.yesterday'))}</span></p>
        {:else}
          <MessageRow
            message={item.message}
            firstInRun={item.firstInRun}
            lastInRun={item.lastInRun}
            {showSenders}
            senderPhoto={showSenders ? photoOf(item.message.senderId, item.message.senderAvatarUrl) : undefined}
            onretry={(key) => store.retry(key)}
            ondiscard={(key) => store.discard(key)}
          />
        {/if}
      </div>
    {/each}
  </div>
</div>

{#if anchor && !anchor.atBottom}
  <button type="button" class="to-bottom" aria-label={t('room.scrollToBottom')} title={t('room.scrollToBottom')} onclick={() => anchor?.scrollToBottom()}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </button>
{/if}
</div>

<p class="visually-hidden" aria-live="polite">{announcement}</p>

<style>
  .timeline {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .content {
    display: flex;
    flex-direction: column;
    max-width: var(--column-timeline-max);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-normal) var(--timeline-gutter);
    justify-content: flex-end;
  }
  .item {
    /* Длинная переписка: вне экрана не раскладывается и не рисуется. Размер «auto»
       браузер запоминает после первой раскладки — якорь это переживает. */
    content-visibility: auto;
    contain-intrinsic-size: auto 3rem;
  }
  .day {
    display: flex;
    justify-content: center;
    margin: var(--space-roomy) 0 var(--space-tight);
  }
  .day span {
    padding: var(--space-tight) var(--space-normal);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .loading {
    margin: var(--space-close) 0;
    text-align: center;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .problem {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-normal);
    margin: auto;
  }
  .to-bottom {
    position: absolute;
    inset-inline-end: var(--space-roomy);
    inset-block-end: var(--space-normal);
    display: grid;
    place-items: center;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-circle);
    background: var(--color-glass-opaque);
    color: var(--accent);
    cursor: pointer;
  }
  .to-bottom svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
