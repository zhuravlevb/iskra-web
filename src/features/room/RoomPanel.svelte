<!--
  «О чате» — правая панель на широком экране, лист на узком (раскладку решает `Columns`).

  Как в нативной Искре: всё, на что у вас нет права, не показывается вовсе — серая кнопка
  обещает то, чего комната не позволит. Роли — словами («Администратор»), не числами.
  Ошибки — по действию, словами нативной Искры: «Человек остался в чате» — это то, что
  нужно знать, когда исключить не вышло.
-->
<script lang="ts">
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import Menu from '../../design/Menu.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { RoomDetailsStore, type MemberSummary, type RoomRole } from '../../core/rooms/roomDetails.svelte.ts';
  import type { RoomAlerts } from '../../core/rooms/pushRules';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { plural, t, type TextKey } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import Avatar from '../../design/Avatar.svelte';
  import RoomFace from '../rooms/RoomFace.svelte';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import RoomEditDialog from './RoomEditDialog.svelte';
  import InviteDialog from './InviteDialog.svelte';
  import RoleDialog from './RoleDialog.svelte';

  interface Props {
    session: UserSession;
    roomId: string;
    /** Перейти к закреплённому сообщению в ленте. */
    onjump: (eventId: string) => void;
  }
  let { session, roomId, onjump }: Props = $props();

  let details = $state<RoomDetailsStore>();
  $effect(() => {
    const store = session.roomDetails(roomId);
    details = store;
    return () => store.destroy();
  });

  const room = $derived(session.rooms.get(roomId));
  const alertsOptions: Array<{ value: RoomAlerts; label: TextKey }> = [
    { value: 'all', label: 'room.manage.alertsAll' },
    { value: 'mentions', label: 'room.manage.alertsMentions' },
    { value: 'muted', label: 'room.manage.alertsMuted' },
  ];

  let editing = $state(false);
  let inviting = $state(false);
  let leaving = $state(false);
  let blocking = $state<MemberSummary | null>(null);
  let roleFor = $state<MemberSummary | null>(null);
  let memberMenu = $state<{ member: MemberSummary; at: { x: number; y: number } } | null>(null);

  const canEdit = $derived(
    !!details && (details.permissions.canRename || details.permissions.canChangeTopic || details.permissions.canChangePicture || details.permissions.canChangeVisibility),
  );

  // Кэш фото участников на время жизни панели.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const photos = new Map<string, Photo>();
  function photoOf(member: MemberSummary): string | undefined {
    if (!member.avatarUrl) return undefined;
    let photo = photos.get(member.avatarUrl);
    if (!photo) {
      photo = new Photo(session, member.avatarUrl, pixelsFor(2.5));
      photos.set(member.avatarUrl, photo);
    }
    return photo.url;
  }

  const roleLabel = (role: RoomRole): string =>
    role === 'administrator' ? t('room.administrator') : role === 'moderator' ? t('room.moderator') : '';

  /** Что можно сделать с участником — если ничего, строка не нажимается. */
  function actionsFor(member: MemberSummary) {
    if (!details) return { write: false, role: false, remove: false, ban: false };
    return {
      write: member.id !== session.userId && !member.invited,
      role: details.rolesFor(member).length > 0,
      remove: details.mayRemove(member),
      ban: details.mayBan(member),
    };
  }

  function openMember(member: MemberSummary, event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    memberMenu = { member, at: { x: rect.left + 16, y: rect.bottom } };
  }

  /**
   * Пункт меню участника: взять участника *до* того, как меню закрыто. `{@const}` внутри
   * меню читает `memberMenu`, и после закрытия читать его уже нечего.
   */
  function onMember(action: (member: MemberSummary) => void) {
    const member = memberMenu?.member;
    memberMenu = null;
    if (member) action(member);
  }

  async function write(member: MemberSummary) {
    try {
      const target = await session.createDirect(member.id);
      router.go({ name: 'room', roomId: target });
    } catch {
      // «Чат не создался» — в панели нового чата; здесь достаточно не упасть.
    }
  }

  async function leave() {
    leaving = false;
    if (await details?.leave()) router.go({ name: 'home' });
  }
</script>

{#if details}
  <div class="panel">
    <header>
      <span class="face">
        {#if room}<RoomFace {room} {session} />{/if}
      </span>
      <h2>{details.name}</h2>
      {#if details.topic}<p class="topic">{details.topic}</p>{/if}
      {#if canEdit}
        <button type="button" class="link" onclick={() => (editing = true)}>{t('room.manage.edit')}</button>
      {/if}
    </header>

    {#if details.failure}
      <div class="failure">
        <ProblemPanel message={t(`roomAction.${details.failure}Failed` as TextKey)} />
      </div>
    {/if}

    <section aria-labelledby="alerts-title">
      <h3 id="alerts-title">{t('room.manage.alerts')}</h3>
      <div class="options" role="radiogroup" aria-labelledby="alerts-title">
        {#each alertsOptions as option (option.value)}
          <button
            type="button"
            role="radio"
            aria-checked={details.alerts === option.value}
            class:chosen={details.alerts === option.value}
            onclick={() => details?.setAlerts(option.value)}>{t(option.label)}</button
          >
        {/each}
      </div>
    </section>

    {#if details.pinned.length}
      <section aria-labelledby="pinned-title">
        <h3 id="pinned-title">{t('room.pinnedTitle')}</h3>
        <ul class="list">
          {#each details.pinned as pin (pin.eventId)}
            <li>
              <button type="button" class="row" disabled={pin.unavailable} onclick={() => onjump(pin.eventId)}>
                <span class="what">
                  {#if pin.senderName}<strong>{pin.senderName}</strong>{/if}
                  <span class="line">{pin.unavailable ? t('reply.unavailable') : pin.text || '…'}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section aria-labelledby="members-title">
      <h3 id="members-title">
        {t('room.tabs.members')}
        <span class="count">{plural('room.members', details.members.length)}</span>
      </h3>
      {#if details.permissions.canInvite}
        <button type="button" class="link" onclick={() => (inviting = true)}>{t('room.manage.invite')}</button>
      {/if}
      <ul class="list">
        {#each details.members as member (member.id)}
          {@const can = actionsFor(member)}
          <li>
            <button
              type="button"
              class="row"
              disabled={!(can.write || can.role || can.remove || can.ban)}
              aria-haspopup="menu"
              onclick={(event) => openMember(member, event)}
            >
              <span class="avatar"><Avatar name={member.name} seed={member.id} photo={photoOf(member)} mode={preferences.faces} /></span>
              <span class="what">
                <span class="name">{member.name}</span>
                {#if member.ambiguous}<span class="line">{member.id}</span>{/if}
                {#if member.invited}<span class="line">{t('room.manage.invited')}</span>{/if}
              </span>
              {#if roleLabel(member.role)}<span class="role">{roleLabel(member.role)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <button type="button" class="danger" disabled={details.working} onclick={() => (leaving = true)}>{t('room.manage.leave')}</button>
    </section>
  </div>

  <Menu
    open={!!memberMenu}
    x={memberMenu?.at.x ?? 0}
    y={memberMenu?.at.y ?? 0}
    label={t('room.manage.memberActions', { name: memberMenu?.member.name ?? '' })}
    onclose={() => (memberMenu = null)}
  >
    {#if memberMenu}
      {@const can = actionsFor(memberMenu.member)}
      {#if can.write}
        <button type="button" role="menuitem" onclick={() => onMember(write)}>{t('room.manage.write')}</button>
      {/if}
      {#if can.role}
        <button type="button" role="menuitem" onclick={() => onMember((m) => (roleFor = m))}>{t('room.manage.role')}</button>
      {/if}
      {#if can.remove}
        <button type="button" role="menuitem" class="danger" onclick={() => onMember((m) => void details?.remove(m))}>{t('room.manage.remove')}</button>
      {/if}
      {#if can.ban}
        <button type="button" role="menuitem" class="danger" onclick={() => onMember((m) => (blocking = m))}>{t('room.manage.block')}</button>
      {/if}
    {/if}
  </Menu>

  <RoomEditDialog open={editing} {details} {session} onclose={() => (editing = false)} />
  <InviteDialog open={inviting} {details} onclose={() => (inviting = false)} />
  <RoleDialog member={roleFor} {details} onclose={() => (roleFor = null)} />

  <ConfirmDialog
    open={leaving}
    title={t('room.manage.leaveQuestion')}
    message={t('room.manage.leaveHelp')}
    confirmLabel={t('room.manage.leave')}
    cancelLabel={t('room.manage.cancel')}
    destructive
    onclose={() => (leaving = false)}
    onconfirm={() => void leave()}
  />
  <ConfirmDialog
    open={!!blocking}
    title={t('room.manage.blockQuestion', { name: blocking?.name ?? '' })}
    message={t('room.manage.blockHelp')}
    confirmLabel={t('room.manage.block')}
    cancelLabel={t('room.manage.cancel')}
    destructive
    onclose={() => (blocking = null)}
    onconfirm={() => {
      if (blocking) void details?.ban(blocking);
      blocking = null;
    }}
  />
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-roomy);
    padding: var(--space-roomy);
    padding-block-end: max(var(--space-roomy), env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-close);
    text-align: center;
  }
  .face {
    --size-room-avatar: var(--size-avatar-large);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
    overflow-wrap: anywhere;
  }
  .topic {
    margin: 0;
    color: var(--color-text-secondary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  h3 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-close);
    margin: 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
  }
  .options {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .options button {
    display: flex;
    align-items: center;
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .options button + button {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .options button.chosen::after {
    content: '✓';
    margin-inline-start: auto;
    color: var(--accent);
    font-weight: 700;
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--space-close);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .row:disabled {
    cursor: default;
  }
  @media (hover: hover) {
    .row:not(:disabled):hover {
      background: var(--color-selected);
    }
  }
  .avatar {
    flex: none;
    --avatar-size: var(--size-avatar);
  }
  .what {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .name,
  .line {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .role {
    flex: none;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .link {
    align-self: flex-start;
    min-height: var(--tap-target);
    padding: 0 var(--space-close);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  header .link {
    align-self: center;
  }
  .danger {
    min-height: var(--tap-target);
    border: none;
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--color-danger);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
