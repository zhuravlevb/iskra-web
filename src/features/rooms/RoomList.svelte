<!--
  Список чатов.

  Один список, как в нативной Искре, на любой ширине: приглашения сверху (на них надо
  ответить), под ними закреплённые, дальше всё по последней активности — пространства вместе
  с чатами. Без заголовков и фильтров. «Архив» — тихой строкой над списком, когда в нём что-то
  есть; пространство и архив открываются на месте списка со стрелкой «назад».

  Стрелки ↑/↓ ходят по строкам, как в любом списке на десктопе.
-->
<script lang="ts">
  import EmptyState from '../../design/EmptyState.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import InviteRow from './InviteRow.svelte';
  import RoomRow from './RoomRow.svelte';
  import { roomName } from './text';

  let { session }: { session: UserSession } = $props();

  type View = { kind: 'all' } | { kind: 'archive' } | { kind: 'space'; id: string };

  let view = $state<View>({ kind: 'all' });
  let failure = $state<TextKey | null>(null);
  $effect(() => {
    if (!failure) return;
    const timer = setTimeout(() => (failure = null), 8000);
    return () => clearTimeout(timer);
  });

  // Часы для меток «вчера» и дней недели: вкладка живёт днями, полночь наступает.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  const selectedId = $derived(router.route.name === 'room' ? router.route.roomId : null);
  const organized = $derived(session.rooms.organized);

  const shown = $derived(
    view.kind === 'archive'
      ? organized.archived
      : view.kind === 'space'
        ? session.rooms.childrenOf(view.id)
        : organized.list,
  );

  const nothingAtAll = $derived(view.kind === 'all' && organized.list.length === 0 && organized.archived.length === 0);

  const viewTitle = $derived(
    view.kind === 'archive'
      ? t('roomList.archive.title')
      : view.kind === 'space'
        ? roomName(session.rooms.get(view.id) ?? ({ id: view.id } as RoomSummary))
        : '',
  );

  function open(room: RoomSummary) {
    if (room.kind === 'space') {
      view = { kind: 'space', id: room.id };
      return;
    }
    router.go({ name: 'room', roomId: room.id });
  }

  /** ↑/↓ — по строкам списка. */
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-room-id]')];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const next = rows[event.key === 'ArrowDown' ? index + 1 : index - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
</script>

{#if view.kind !== 'all'}
  <div class="subheader">
    <IconButton label={t('room.back')} onclick={() => (view = { kind: 'all' })}><Icon name="back" /></IconButton>
    <h2>{viewTitle}</h2>
  </div>
{/if}

{#if failure}
  <div class="failure">
    <ProblemPanel title={t('problem.title')} message={t(failure)} />
  </div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="list" {onkeydown}>
  {#if !session.ready && session.rooms.rooms.length === 0}
    <EmptyState title={t('roomList.loading')} />
  {:else if nothingAtAll}
    <EmptyState title={t('roomList.emptyTitle')} message={t('roomList.emptyMessage')} />
  {:else if view.kind === 'space' && shown.length === 0}
    <EmptyState title={t('room.spaceEmptyTitle')} />
  {:else}
    {#if view.kind === 'all' && organized.archived.length > 0}
      <button type="button" class="archive" onclick={() => (view = { kind: 'archive' })}>
        {t('roomList.archive.entry', { count: organized.archived.length })}
      </button>
    {/if}
    {#each shown as room (room.id)}
      {#if room.membership === 'invite'}
        <InviteRow {room} {session} onfailure={(key) => (failure = key)} />
      {:else}
        <RoomRow {room} {session} {now} selected={room.id === selectedId} onopen={() => open(room)} />
      {/if}
    {/each}
  {/if}
</div>

<style>
  .list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
  }
  .subheader {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    padding: var(--space-tight) var(--space-close);
  }
  .subheader h2 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
  }
  .archive {
    display: block;
    width: calc(100% - 2 * var(--space-tight));
    min-height: var(--tap-target);
    margin: var(--space-close) var(--space-tight);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--color-text-secondary);
    text-align: start;
    cursor: pointer;
  }
  /* Наведение — только там, где указатель умеет наводиться: на телефоне тап оставлял бы «залипшую» подсветку. */
  @media (hover: hover) {
    .archive:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .failure {
    padding: var(--space-close);
  }
</style>
