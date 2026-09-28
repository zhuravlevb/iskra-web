<!--
  Список чатов.

  На широком экране — разделами, как бета-панель нативной Искры на Mac: приглашения,
  пространства, закреплённые, остальные. На телефоне — одним списком (приглашения сверху —
  на них надо ответить) с фильтром над ним. Архив — строкой в конце, пространство и архив
  открываются на месте списка со стрелкой «назад».

  Стрелки ↑/↓ ходят по строкам, как в любом списке на десктопе.
-->
<script lang="ts">
  import EmptyState from '../../design/EmptyState.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { router } from '../../core/navigation/router.svelte.ts';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import InviteRow from './InviteRow.svelte';
  import RoomRow from './RoomRow.svelte';
  import { roomName } from './text';

  let { session }: { session: UserSession } = $props();

  type View = { kind: 'all' } | { kind: 'archive' } | { kind: 'space'; id: string };
  type Filter = 'all' | 'pinned' | 'spaces';

  let view = $state<View>({ kind: 'all' });
  let filter = $state<Filter>('all');
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
  const sections = $derived(session.rooms.sections);
  const wide = $derived(viewport.layout !== 'stack');

  interface Group {
    title?: TextKey;
    rooms: RoomSummary[];
  }

  const groups = $derived.by((): Group[] => {
    if (view.kind === 'archive') return [{ rooms: sections.archived }];
    if (view.kind === 'space') return [{ rooms: session.rooms.childrenOf(view.id) }];
    const { invitations, spaces, pinned, chats } = sections;
    if (wide) {
      const alone = !invitations.length && !spaces.length && !pinned.length;
      return [
        { title: 'roomList.section.invitations' as TextKey, rooms: invitations },
        { title: 'roomList.section.spaces' as TextKey, rooms: spaces },
        { title: 'roomList.section.pinned' as TextKey, rooms: pinned },
        { ...(alone ? {} : { title: 'roomList.section.chats' as TextKey }), rooms: chats },
      ].filter((g) => g.rooms.length > 0);
    }
    if (filter === 'pinned') return [{ rooms: pinned }];
    if (filter === 'spaces') return [{ rooms: spaces }];
    return [{ rooms: [...invitations, ...pinned, ...chats] }];
  });

  const filters = $derived(
    (
      [
        ['all', 'roomList.filter.all'],
        ['pinned', 'roomList.section.pinned'],
        ['spaces', 'roomList.section.spaces'],
      ] as const
    ).filter(([id]) => id === 'all' || (id === 'pinned' ? sections.pinned.length : sections.spaces.length) > 0),
  );

  const nothingAtAll = $derived(
    view.kind === 'all' && groups.every((g) => g.rooms.length === 0) && sections.archived.length === 0,
  );

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
{:else if !wide && filters.length > 1}
  <div class="filters" role="toolbar" aria-label={t('roomList.title')}>
    {#each filters as [id, label] (id)}
      <button type="button" class="chip" aria-pressed={filter === id} onclick={() => (filter = id)}>{t(label)}</button>
    {/each}
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
  {:else if view.kind === 'space' && groups[0]?.rooms.length === 0}
    <EmptyState title={t('room.spaceEmptyTitle')} />
  {:else}
    {#each groups as group (group.title ?? 'rest')}
      <section aria-label={group.title ? t(group.title) : undefined}>
        {#if group.title}<h2 class="section">{t(group.title)}</h2>{/if}
        {#each group.rooms as room (room.id)}
          {#if room.membership === 'invite'}
            <InviteRow {room} {session} onfailure={(key) => (failure = key)} />
          {:else}
            <RoomRow {room} {session} {now} selected={room.id === selectedId} onopen={() => open(room)} />
          {/if}
        {/each}
      </section>
    {/each}
    {#if view.kind === 'all' && sections.archived.length > 0}
      <button type="button" class="archive" onclick={() => (view = { kind: 'archive' })}>
        {t('roomList.archive.entry', { count: sections.archived.length })}
      </button>
    {/if}
  {/if}
</div>

<style>
  .list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
  }
  section {
    display: flex;
    flex-direction: column;
  }
  .section {
    margin: var(--space-normal) var(--space-roomy) var(--space-tight);
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
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
  .filters {
    display: flex;
    gap: var(--space-close);
    padding: var(--space-close) var(--space-normal);
    overflow-x: auto;
  }
  .chip {
    flex: none;
    min-height: var(--tap-target);
    padding: 0 var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-circle);
    background: transparent;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    border-color: transparent;
    background: var(--accent);
    color: var(--on-accent);
  }
  .archive {
    display: block;
    width: calc(100% - 2 * var(--space-tight));
    min-height: var(--tap-target);
    margin: var(--space-close) var(--space-tight) 0;
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
