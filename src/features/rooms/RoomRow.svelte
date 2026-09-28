<!--
  Одна строка списка чатов. Ссылка, а не кнопка: адрес чата — настоящий, его можно открыть
  средней кнопкой и положить в закладки.

  Превью — две строки, и место под вторую держится, даже когда она пуста: иначе столбец
  строк разной высоты читается так, будто список отсортирован по длине сообщения.
-->
<script lang="ts">
  import UnreadBadge from '../../design/UnreadBadge.svelte';
  import { roomTimestamp } from '../../design/time';
  import { formatRoute } from '../../core/navigation/route';
  import { emphasisOf, hasUnread, type RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import RoomFace from './RoomFace.svelte';
  import { previewText, roomName, rowLabel } from './text';

  interface Props {
    room: RoomSummary;
    session: UserSession;
    selected: boolean;
    now: number;
    onopen?: (roomId: string) => void;
  }
  let { room, session, selected, now, onopen }: Props = $props();

  const number = $derived(new Intl.NumberFormat(i18n.locale));
</script>

<a
  class="row"
  href={formatRoute({ name: 'room', roomId: room.id })}
  aria-current={selected ? 'page' : undefined}
  aria-label={rowLabel(room)}
  data-room-id={room.id}
  onclick={(event) => {
    if (!onopen || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onopen(room.id);
  }}
>
  <RoomFace {room} {session} />
  <span class="body">
    <span class="line">
      <span class="name">{roomName(room)}</span>
      {#if room.encrypted}
        <svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg>
      {/if}
      <span class="spacer"></span>
      {#if room.isFavourite}
        <svg class="pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4-1-6zM12 13v8" /></svg>
      {/if}
      {#if room.lastActivity}
        <time class="time">{roomTimestamp(room.lastActivity, now, i18n.locale, t('room.yesterday'))}</time>
      {/if}
    </span>
    <span class="line top">
      <span class="preview">{previewText(room.preview)}</span>
      {#if hasUnread(room) || room.mentionCount > 0}
        <UnreadBadge
          count={room.unreadCount}
          mentioned={room.mentionCount > 0}
          muted={emphasisOf(room) === 'muted'}
          format={(n) => number.format(n)}
        />
      {/if}
    </span>
  </span>
</a>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--row-room);
    padding: var(--space-close) var(--space-normal);
    margin-inline: var(--space-tight);
    border-radius: var(--radius-control);
    color: inherit;
    text-decoration: none;
    /* Пятьсот комнат — не беда: строки вне экрана не раскладываются и не рисуются. */
    content-visibility: auto;
    contain-intrinsic-size: auto var(--row-room);
  }
  /* Наведение — только там, где указатель умеет наводиться: на телефоне тап оставлял бы «залипшую» подсветку. */
  @media (hover: hover) {
    .row:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .row[aria-current='page'] {
    background: var(--color-selected);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    flex: 1;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    min-width: 0;
  }
  .line.top {
    align-items: flex-start;
    gap: var(--space-close);
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }
  .lock,
  .pin {
    flex: none;
    width: var(--font-size-caption);
    height: var(--font-size-caption);
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .lock {
    color: var(--color-text-secondary);
  }
  .pin {
    color: var(--accent);
  }
  .time {
    flex: none;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .preview {
    flex: 1;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: calc(2em * var(--line-height-body));
    font-size: var(--font-size-caption);
    line-height: var(--line-height-body);
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  /* Под мышью строка ниже — одна строка превью, и место под вторую не держим. */
  @media (hover: hover) and (pointer: fine) {
    .preview {
      -webkit-line-clamp: 1;
      line-clamp: 1;
      min-height: calc(1em * var(--line-height-body));
    }
  }
</style>
