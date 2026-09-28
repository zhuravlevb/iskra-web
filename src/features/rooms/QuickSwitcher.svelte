<!--
  Быстрый переход — `Ctrl/⌘ K`. На десктопе это главный способ попасть в чат: поиск по
  названиям — фильтр по памяти, запрос на сервер не уходит.

  Нативный `<dialog>`: фокус ловит сам и возвращает, когда закрыт; `Esc` закрывает.
  ↑/↓ — по результатам, `Enter` — открыть.
-->
<script lang="ts">
  import { searchRooms } from '../../core/rooms/organize';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import RoomFace from './RoomFace.svelte';
  import { previewText, roomName } from './text';

  interface Props {
    session: UserSession;
    open: boolean;
    onclose: () => void;
  }
  let { session, open, onclose }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  let query = $state('');
  let active = $state(0);
  const id = $props.id();

  const results = $derived(searchRooms(session.rooms.rooms, query, roomName).slice(0, 50));

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      query = '';
      active = 0;
      dialog.showModal();
      input?.focus();
    }
    if (!open && dialog.open) dialog.close();
  });

  $effect(() => {
    void query;
    active = 0;
  });

  function choose(index: number) {
    const room = results[index];
    if (!room) return;
    onclose();
    router.go({ name: 'room', roomId: room.id });
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = Math.max(0, Math.min(results.length - 1, active + step));
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    }
  }
</script>

<dialog bind:this={dialog} class="switcher" aria-label={t('quickSwitch.label')} {onclose}>
  <input
    bind:this={input}
    bind:value={query}
    type="text"
    role="combobox"
    aria-expanded="true"
    aria-controls="{id}-results"
    aria-activedescendant={results.length ? `${id}-option-${active}` : undefined}
    aria-label={t('quickSwitch.label')}
    placeholder={t('quickSwitch.placeholder')}
    autocomplete="off"
    spellcheck="false"
    {onkeydown}
  />
  <ul id="{id}-results" role="listbox" aria-label={t('quickSwitch.label')}>
    {#each results as room, index (room.id)}
      <li
        id="{id}-option-{index}"
        role="option"
        aria-selected={index === active}
        onclick={() => choose(index)}
        onkeydown={() => {}}
        onpointermove={() => (active = index)}
      >
        <RoomFace {room} {session} />
        <span class="text">
          <span class="name">{roomName(room)}</span>
          <span class="preview">{previewText(room.preview)}</span>
        </span>
      </li>
    {:else}
      <li class="empty" role="presentation">{t('quickSwitch.empty')}</li>
    {/each}
  </ul>
</dialog>

<style>
  .switcher {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--column-timeline-max));
    max-height: min(70vh, 40rem);
    margin-block-start: 12vh;
    padding: 0;
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.3);
    overflow: hidden;
  }
  .switcher[open] {
    display: flex;
    flex-direction: column;
  }
  .switcher::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  input {
    min-height: var(--size-navigation-bar);
    margin: var(--space-close);
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
    font-size: var(--font-size-body);
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }
  ul {
    margin: 0;
    padding: 0 var(--space-close) var(--space-close);
    list-style: none;
    overflow-y: auto;
  }
  li {
    --size-room-avatar: var(--size-avatar-toolbar);
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    padding: var(--space-tight) var(--space-close);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  li[aria-selected='true'] {
    background: var(--color-selected);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .preview {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .empty {
    justify-content: center;
    padding: var(--space-generous);
    color: var(--color-text-secondary);
    cursor: default;
  }
</style>
