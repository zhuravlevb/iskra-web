<!--
  Открытый чат: лента и композер. Лента создаётся при открытии и уничтожается при уходе —
  стор живёт ровно столько, сколько чат на экране.
-->
<script lang="ts">
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import Composer from './Composer.svelte';
  import Timeline from './Timeline.svelte';

  let { session, roomId }: { session: UserSession; roomId: string } = $props();

  let store = $state<TimelineStore>();
  let composer: Composer | undefined = $state();

  $effect(() => {
    const created = session.timeline(roomId);
    store = created;
    return () => created.destroy();
  });

  $effect(() => {
    void roomId;
    composer?.focus();
  });

  const room = $derived(session.rooms.get(roomId));
  const canSend = $derived(room?.membership === 'join' || (!room && session.canSend(roomId)));
</script>

<div class="room">
  {#if store}
    {#key store}
      <Timeline {store} {session} showSenders={room?.kind !== 'direct'} />
    {/key}
  {/if}
  <Composer bind:this={composer} disabled={!canSend} onsend={(text) => store?.send(text)} />
</div>

<style>
  .room {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
</style>
