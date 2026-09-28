<!--
  Оболочка вошедшего человека: раскладка в три ширины, список чатов, горячие клавиши
  уровня приложения и число непрочитанных в заголовке вкладки. Лента — этап 4.
-->
<script lang="ts">
  import Columns from '../../design/Columns.svelte';
  import Bar from '../../design/Bar.svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { app } from '../../core/session/app.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { describeHotkey, match } from '../../design/hotkeys';
  import { hasUnread } from '../../core/rooms/types';
  import { preferences } from './preferences.svelte.ts';
  import OfflineStrip from './OfflineStrip.svelte';
  import StorageNotice from './StorageNotice.svelte';
  import { showBadge } from './badge.svelte.ts';
  import RoomList from '../rooms/RoomList.svelte';
  import QuickSwitcher from '../rooms/QuickSwitcher.svelte';
  import { roomName } from '../rooms/text';
  import RoomView from '../room/RoomView.svelte';
  import HotkeyHelp from './HotkeyHelp.svelte';
  import NewChatDialog from '../rooms/NewChatDialog.svelte';
  import Settings from '../settings/Settings.svelte';
  import RoomPanel from '../room/RoomPanel.svelte';
  import LockedHistoryStrip from '../recovery/LockedHistoryStrip.svelte';

  let { session }: { session: UserSession } = $props();
  let confirmingSignOut = $state(false);
  let switching = $state(false);
  let helping = $state(false);
  let creating = $state(false);
  let roomView: RoomView | undefined = $state();

  let panelOpen = $state(false);
  const roomId = $derived(router.route.name === 'room' ? router.route.roomId : null);
  const room = $derived(roomId ? session.rooms.get(roomId) : undefined);
  // Чат, которого нет в списке (чужая ссылка, ещё не синхронизирован), — показываем ID.
  const title = $derived(room ? roomName(room) : (roomId ?? ''));

  $effect(() => {
    showBadge(session.rooms.badge, t('app.name'));
  });
  $effect(() => () => showBadge(0, t('app.name')));

  /** Видимый порядок чатов — для Alt ↑/↓: как в списке, без архива и пространств. */
  function visibleOrder() {
    const { pinned, chats } = session.rooms.sections;
    return [...pinned, ...chats];
  }

  function step(direction: 1 | -1, onlyUnread: boolean) {
    const order = visibleOrder();
    const at = order.findIndex((r) => r.id === roomId);
    for (let i = at + direction; i >= 0 && i < order.length; i += direction) {
      const candidate = order[i]!;
      if (!onlyUnread || hasUnread(candidate) || candidate.mentionCount > 0) {
        router.go({ name: 'room', roomId: candidate.id });
        return;
      }
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const action = match(event);
    if (!action) return;
    switch (action) {
      case 'quickSwitch':
        switching = true;
        break;
      case 'previousChat':
        step(-1, false);
        break;
      case 'nextChat':
        step(1, false);
        break;
      case 'previousUnread':
        step(-1, true);
        break;
      case 'nextUnread':
        step(1, true);
        break;
      case 'help':
        helping = true;
        break;
      case 'settings':
        router.go({ name: 'settings' });
        break;
      case 'escape':
        // Открытое окно или меню закрывается само (`<dialog>`); это — когда закрывать нечего.
        if (document.querySelector('dialog[open]')) return;
        if (panelOpen) panelOpen = false;
        else if (roomId) roomView?.escape();
        else return;
        break;
      case 'attach':
        if (!roomId) return;
        roomView?.attach();
        break;
      case 'pageUp':
      case 'pageDown':
        if (!roomId) return;
        roomView?.page(action === 'pageUp' ? -1 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function closeRoom() {
    panelOpen = false;
    router.go({ name: 'home' });
  }
</script>

<Columns
  bind:listWidth={preferences.listWidth}
  showMain={roomId !== null || router.route.name === 'settings'}
  panelOpen={panelOpen && roomId !== null}
  onClosePanel={() => (panelOpen = false)}
  resizeLabel={t('layout.resizeList')}
>
  {#snippet list()}
    <div class="list-column">
      <Bar title={t('roomList.title')}>
        {#snippet trailing()}
          <IconButton label={t('quickSwitch.label')} shortcut={describeHotkey('quickSwitch')} onclick={() => (switching = true)}>
            <Icon name="search" />
          </IconButton>
          <IconButton label={t('roomList.newConversation')} onclick={() => (creating = true)}>
            <Icon name="compose" />
          </IconButton>
          <IconButton label={t('account.settings')} shortcut={describeHotkey('settings')} onclick={() => router.go({ name: 'settings' })}>
            <Icon name="settings" />
          </IconButton>
        {/snippet}
      </Bar>
      <OfflineStrip {session} />
      <StorageNotice />
      <LockedHistoryStrip recovery={session.recovery} onopen={() => app.openRecovery()} />
      <RoomList {session} />
    </div>
  {/snippet}

  {#snippet main()}
    {#if roomId}
      <div class="main-column">
      <Bar {title}>
        {#snippet leading()}
          {#if viewport.layout === 'stack'}
            <IconButton label={t('room.back')} onclick={closeRoom}><Icon name="back" /></IconButton>
          {/if}
        {/snippet}
        {#snippet trailing()}
          <IconButton label={t('room.info')} pressed={panelOpen} onclick={() => (panelOpen = !panelOpen)}>
            <Icon name="info" />
          </IconButton>
        {/snippet}
      </Bar>
      {#key roomId}
        <RoomView bind:this={roomView} {session} {roomId} />
      {/key}
      </div>
    {:else if router.route.name === 'settings'}
      <div class="main-column">
        <Bar title={t('settings.title')}>
          {#snippet leading()}
            {#if viewport.layout === 'stack'}
              <IconButton label={t('settings.back')} onclick={() => router.go({ name: 'home' })}><Icon name="back" /></IconButton>
            {/if}
          {/snippet}
        </Bar>
        <Settings {session} section={router.route.section} />
      </div>
    {:else}
      <EmptyState title={t('room.noRoomSelectedTitle')} message={t('room.noRoomSelectedMessage')} />
    {/if}
  {/snippet}

  {#snippet panel()}
    <div class="panel-column">
      <Bar title={t('room.info')}>
        {#snippet trailing()}
          <IconButton label={t('room.infoClose')} onclick={() => (panelOpen = false)}><Icon name="close" /></IconButton>
        {/snippet}
      </Bar>
      {#if roomId}
        {#key roomId}
          <RoomPanel
            {session}
            {roomId}
            onjump={(eventId) => {
              // На узком экране лист закрывает ленту — к сообщению можно только закрыв его.
              if (viewport.layout !== 'three') panelOpen = false;
              roomView?.reveal(eventId);
            }}
          />
        {/key}
      {/if}
    </div>
  {/snippet}
</Columns>

<svelte:window {onkeydown} />

<QuickSwitcher {session} open={switching} onclose={() => (switching = false)} />
<HotkeyHelp open={helping} onclose={() => (helping = false)} />
<NewChatDialog open={creating} {session} onclose={() => (creating = false)} />

<ConfirmDialog
  open={confirmingSignOut}
  title={t('signOut.confirmTitle')}
  message={t('signOut.confirmMessage')}
  confirmLabel={t('account.signOut')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (confirmingSignOut = false)}
  onconfirm={() => {
    confirmingSignOut = false;
    void app.signOut();
  }}
/>

<style>
  .main-column {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
.panel-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .panel-column > :global(:last-child) {
    flex: 1;
    min-height: 0;
  }
    .list-column {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
