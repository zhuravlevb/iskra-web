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
  import LockedHistoryStrip from '../recovery/LockedHistoryStrip.svelte';

  let { session }: { session: UserSession } = $props();
  let confirmingSignOut = $state(false);
  let switching = $state(false);

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
  showMain={roomId !== null}
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
          <IconButton label={t('account.signOut')} onclick={() => (confirmingSignOut = true)}>
            <Icon name="signOut" />
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
        <RoomView {session} {roomId} />
      {/key}
      </div>
    {:else}
      <EmptyState title={t('room.noRoomSelectedTitle')} message={t('room.noRoomSelectedMessage')} />
    {/if}
  {/snippet}

  {#snippet panel()}
    <Bar title={t('room.info')}>
      {#snippet trailing()}
        <IconButton label={t('room.infoClose')} onclick={() => (panelOpen = false)}><Icon name="close" /></IconButton>
      {/snippet}
    </Bar>
  {/snippet}
</Columns>

<svelte:window {onkeydown} />

<QuickSwitcher {session} open={switching} onclose={() => (switching = false)} />

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
  .list-column {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
