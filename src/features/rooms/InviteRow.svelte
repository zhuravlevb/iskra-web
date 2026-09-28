<!--
  Приглашение — в том же списке, что и разговоры, и выглядит как их родственник: то же
  лицо, то же имя. Разница в том, что оно спрашивает, а не сообщает: вместо последнего
  сообщения — кто зовёт, вместо «открыть» — два ответа. Открыть его нельзя: вы ещё не в
  комнате, и то, что туда напишете, сервер не примет.
-->
<script lang="ts">
  import QuietButton from '../../design/QuietButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import RoomFace from './RoomFace.svelte';
  import { roomName } from './text';

  interface Props {
    room: RoomSummary;
    session: UserSession;
    onfailure: (key: 'roomAction.acceptInviteFailed' | 'roomAction.declineInviteFailed') => void;
  }
  let { room, session, onfailure }: Props = $props();
  let busy = $state<'accept' | 'decline' | null>(null);

  async function answer(kind: 'accept' | 'decline') {
    busy = kind;
    try {
      if (kind === 'accept') await session.rooms.accept(room.id);
      else await session.rooms.decline(room.id);
    } catch {
      onfailure(kind === 'accept' ? 'roomAction.acceptInviteFailed' : 'roomAction.declineInviteFailed');
    } finally {
      busy = null;
    }
  }
</script>

<div class="invite" role="group" aria-label={roomName(room)}>
  <RoomFace {room} {session} />
  <div class="body">
    <span class="name">{roomName(room)}</span>
    <span class="from">
      {room.invitedBy ? t('roomList.invite.from', { name: room.invitedBy }) : t('roomList.invite.unattributed')}
    </span>
    <div class="actions">
      <QuietButton disabled={!!busy} onclick={() => void answer('decline')}>{t('roomList.invite.decline')}</QuietButton>
      <PrimaryButton busy={busy === 'accept'} disabled={!!busy} onclick={() => void answer('accept')}>
        {t('roomList.invite.accept')}
      </PrimaryButton>
    </div>
  </div>
</div>

<style>
  .invite {
    display: flex;
    gap: var(--space-normal);
    padding: var(--space-close) var(--space-normal);
    margin-inline: var(--space-tight);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .from {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-close);
  }
</style>
