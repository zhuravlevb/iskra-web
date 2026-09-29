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
  import { i18n, plural, t, type TextKey } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import Avatar from '../../design/Avatar.svelte';
  import RoomFace from '../rooms/RoomFace.svelte';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import RoomEditDialog from './RoomEditDialog.svelte';
  import InviteDialog from './InviteDialog.svelte';
  import RoleDialog from './RoleDialog.svelte';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { roomTimestamp } from '../../design/time';
  import FileCard from '../media/FileCard.svelte';
  import MediaTile from '../media/MediaTile.svelte';
  import Viewer, { type ViewerItem } from '../media/Viewer.svelte';
  import { availableTabs, roomContents, type ContentItem, type ContentTab } from './contents';

  interface Props {
    session: UserSession;
    roomId: string;
    /** Перейти к закреплённому сообщению в ленте. */
    onjump: (eventId: string) => void;
    /** Лента открытого чата: вкладки «Что внутри» — из того, что она загрузила. */
    timeline?: TimelineStore;
  }
  let { session, roomId, onjump, timeline }: Props = $props();

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

  // ————— Что внутри: вкладки —————

  const contents = $derived(roomContents(timeline?.messages ?? []));
  const tabs = $derived(availableTabs(contents, room?.kind !== 'direct'));
  /** Что нажато последним. Могло исчезнуть — тогда открыта первая, а не пустая. */
  let chosen = $state<ContentTab>('members');
  const tab = $derived(tabs.includes(chosen) ? chosen : tabs[0]);
  const tabTitle = (value: ContentTab): TextKey => `room.tabs.${value}`;
  let tabButtons: Record<string, HTMLButtonElement | undefined> = $state({});
  // Полоса шире узкой панели — прокручивается; выбранная вкладка не должна остаться за краем.
  // Только саму полосу: `scrollIntoView` сдвинул бы и панель, стоит полосе быть ниже края.
  let strip: HTMLElement | undefined = $state();
  $effect(() => {
    const button = tab ? tabButtons[tab] : undefined;
    if (!strip || !button) return;
    const left = button.offsetLeft; // от полосы: она `position: relative`
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + button.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + button.offsetWidth - strip.clientWidth;
  });
  let viewing = $state<{ items: ViewerItem[]; start: string } | null>(null);
  let loadingEarlier = $state(false);
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  /** Стрелки ходят по вкладкам, как в любом `tablist`; одна остановка Tab на всю полосу. */
  function onTabKey(event: KeyboardEvent) {
    const at = tab ? tabs.indexOf(tab) : -1;
    const next =
      event.key === 'ArrowRight' ? tabs[(at + 1) % tabs.length]
      : event.key === 'ArrowLeft' ? tabs[(at - 1 + tabs.length) % tabs.length]
      : event.key === 'Home' ? tabs[0]
      : event.key === 'End' ? tabs.at(-1)
      : undefined;
    if (!next) return;
    event.preventDefault();
    chosen = next;
    tabButtons[next]?.focus();
  }

  function view(items: ContentItem[], start: string) {
    const visual = items.flatMap((i) => (i.kind === 'image' || i.kind === 'video' || i.kind === 'videoNote' ? [{ key: i.key, kind: i.kind, attachment: i.attachment }] : []));
    viewing = { items: visual, start };
  }

  async function loadEarlier() {
    if (!timeline || loadingEarlier) return;
    loadingEarlier = true;
    try {
      await timeline.loadMore();
    } finally {
      loadingEarlier = false;
    }
  }

  const when = (ts: number) => roomTimestamp(ts, now, i18n.locale, t('room.yesterday'));
  const duration = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

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

    {#if tab}
      <section class="contents" aria-labelledby="contents-title">
        <div class="tabs" bind:this={strip} role="tablist" aria-label={t('room.tabs.label')} tabindex="-1" onkeydown={onTabKey}>
          {#each tabs as value (value)}
            <button
              type="button"
              role="tab"
              id="tab-{value}"
              aria-selected={tab === value}
              aria-controls="tabpanel"
              tabindex={tab === value ? 0 : -1}
              bind:this={tabButtons[value]}
              onclick={() => (chosen = value)}>{t(tabTitle(value))}</button
            >
          {/each}
        </div>
        <div id="tabpanel" role="tabpanel" aria-labelledby="tab-{tab}">
          <h3 id="contents-title">
            {t(tabTitle(tab))}
            {#if tab === 'members'}<span class="count">{plural('room.members', details.members.length)}</span>{/if}
          </h3>
          {#if tab === 'members'}
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
          {:else if tab === 'media'}
            <ul class="grid">
              {#each contents.media as item (item.key)}
                <li>
                  <MediaTile kind={item.kind === 'video' ? 'video' : 'image'} attachment={item.attachment} media={session.media} onopen={() => view(contents.media, item.key)} />
                </li>
              {/each}
            </ul>
          {:else if tab === 'videoNotes'}
            <ul class="list">
              {#each contents.videoNotes as item (item.key)}
                <li class="item">
                  <span class="note"><MediaTile kind="videoNote" attachment={item.attachment} media={session.media} onopen={() => view(contents.videoNotes, item.key)} /></span>
                  <span class="what">
                    <span class="name">{item.senderName}</span>
                    <span class="line">{item.attachment.duration ? `${duration(item.attachment.duration)} · ` : ''}{when(item.ts)}</span>
                  </span>
                </li>
              {/each}
            </ul>
          {:else if tab === 'voice' || tab === 'files'}
            <ul class="list">
              {#each contents[tab] as item (item.key)}
                <li class="file">
                  <FileCard kind={item.kind === 'file' ? 'file' : item.kind === 'voice' ? 'voice' : 'audio'} attachment={item.attachment} media={session.media} />
                  <span class="line">{item.senderName} · {when(item.ts)}</span>
                </li>
              {/each}
            </ul>
          {:else if tab === 'links'}
            <ul class="list">
              {#each contents.links as item (item.key)}
                <li class="file">
                  <a class="address" href={item.href} target="_blank" rel="noopener noreferrer">{item.text}</a>
                  <span class="context">{item.context}</span>
                  <span class="line">{when(item.ts)}</span>
                </li>
              {/each}
            </ul>
          {/if}
          {#if tab !== 'members' && timeline && !timeline.atStart}
            <button type="button" class="link earlier" disabled={loadingEarlier} aria-busy={loadingEarlier} onclick={() => void loadEarlier()}>
              {t('room.galleryLoadEarlier')}
            </button>
          {/if}
        </div>
      </section>
    {/if}

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

  {#if viewing}
    <Viewer items={viewing.items} start={viewing.start} media={session.media} onclose={() => (viewing = null)} />
  {/if}

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
  .tabs {
    position: relative;
    display: flex;
    gap: var(--space-tight);
    padding: var(--space-tight);
    border-radius: var(--radius-circle);
    background: var(--color-surface);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    flex: 1 0 auto;
    min-height: var(--tap-target);
    padding: 0 var(--space-close);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--font-size-caption);
    white-space: nowrap;
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
  [role='tabpanel'] {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--size-gallery-tile), 1fr));
    gap: var(--space-tight);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    padding: var(--space-tight) var(--space-close);
  }
  .note {
    flex: none;
    width: var(--size-avatar);
  }
  .file {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    padding: var(--space-close);
    min-width: 0;
  }
  .file + .file {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .address {
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  .context {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  .link.earlier {
    align-self: center;
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
