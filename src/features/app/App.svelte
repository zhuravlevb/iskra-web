<!--
  Корень приложения. Этап 1 — скелет: раскладка в три ширины настоящая, колонки пока
  пустые. Список чатов появится на этапе 3, лента — на этапе 4.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Columns from '../../design/Columns.svelte';
  import Bar from '../../design/Bar.svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import { viewport } from '../../design/viewport.svelte';
  import { router } from '../../core/navigation/router.svelte';
  import { i18n, t } from '../../i18n/index.svelte';
  import { preferences } from './preferences.svelte';
  import UpdatePrompt from './UpdatePrompt.svelte';

  let panelOpen = $state(false);
  const roomId = $derived(router.route.name === 'room' ? router.route.roomId : null);

  onMount(() => preferences.persist());

  $effect(() => {
    document.documentElement.lang = i18n.locale;
    document.title = t('app.name');
  });

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
    <Bar title={t('roomList.title')} />
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

<UpdatePrompt />
