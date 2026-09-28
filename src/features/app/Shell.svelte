<!--
  Оболочка вошедшего человека: раскладка в три ширины. Колонки пока пустые — список
  чатов появится на этапе 3, лента — на этапе 4.
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
  import { preferences } from './preferences.svelte.ts';
  import OfflineStrip from './OfflineStrip.svelte';
  import StorageNotice from './StorageNotice.svelte';

  let { session }: { session: UserSession } = $props();
  let confirmingSignOut = $state(false);

  let panelOpen = $state(false);
  const roomId = $derived(router.route.name === 'room' ? router.route.roomId : null);

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
    <Bar title={t('roomList.title')}>
      {#snippet trailing()}
        <IconButton label={t('account.signOut')} onclick={() => (confirmingSignOut = true)}>
          <Icon name="signOut" />
        </IconButton>
      {/snippet}
    </Bar>
    <OfflineStrip {session} />
    <StorageNotice />
    <EmptyState title={t('roomList.emptyTitle')} message={t('roomList.emptyMessage')} />
  {/snippet}

  {#snippet main()}
    {#if roomId}
      <Bar title={roomId}>
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
