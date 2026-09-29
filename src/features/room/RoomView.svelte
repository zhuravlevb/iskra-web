<!--
  Открытый чат: полоса закреплённого, лента, «печатает…», композер. Лента создаётся при
  открытии и уничтожается при уходе — стор живёт ровно столько, сколько чат на экране.

  Здесь же сходятся действия над сообщением (`MessageActions`): ответ и правка — в
  композер, удаление — через вопрос «удалить у всех?», остальное — в ленту. И черновик:
  читается при открытии, пишется, пока печатают, и при уходе из чата — чтобы переключение
  между чатами на десктопе его не теряло.
-->
<script lang="ts">
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import type { OutgoingFile } from '../../core/media/upload';
  import { fileSize } from '../media/files';
  import { prepareFile } from '../media/prepare';
  import Viewer, { type ViewerItem } from '../media/Viewer.svelte';
  import type { Message } from '../../core/timeline/message';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import type { ComposerContext, MessageActions } from './actions';
  import Composer from './Composer.svelte';
  import MessageMenu from './MessageMenu.svelte';
  import PinnedStrip from './PinnedStrip.svelte';
  import { typingText } from './text';
  import Timeline from './Timeline.svelte';

  interface Props {
    session: UserSession;
    roomId: string;
    /** Лента чата — наружу, для вкладок «О чате»: они читают то, что она загрузила. */
    store?: TimelineStore;
  }
  let { session, roomId, store = $bindable() }: Props = $props();

  /** Сколько «печатает…» держится после того, как все перестали: сообщение вот-вот придёт. */
  const TYPING_GRACE_MS = 700;
  const DRAFT_SAVE_MS = 400;

  let composer: Composer | undefined = $state();
  let timeline: Timeline | undefined = $state();

  let text = $state('');
  let context = $state<ComposerContext>(null);
  /** Черновик, отложенный на время правки: правка — не черновик. */
  let stashed = '';
  let menu = $state<{ message: Message; at: { x: number; y: number }; sheet: boolean } | null>(null);
  let deleting = $state<Message | null>(null);
  let blocking = $state<Message | null>(null);
  let attachments = $state<OutgoingFile[]>([]);
  let dropping = $state(false);
  let tooLarge = $state('');
  let viewing = $state<{ items: ViewerItem[]; start: string } | null>(null);

  $effect(() => {
    const id = roomId;
    const created = session.timeline(id);
    store = created;
    text = '';
    context = null;
    stashed = '';
    attachments = [];
    tooLarge = '';
    let loaded = false;
    void session.draft(id).then((draft) => {
      loaded = true;
      // Человек успел начать печатать — его текст важнее вчерашнего черновика.
      if (store === created && text === '' && draft) text = draft;
    });
    return () => {
      clearTimeout(saveTimer);
      if (loaded) void session.saveDraft(id, draftText());
      created.destroy();
    };
  });

  $effect(() => {
    void roomId;
    composer?.focus();
  });

  const room = $derived(session.rooms.get(roomId));
  const canSend = $derived(room?.membership === 'join' || (!room && session.canSend(roomId)));

  // ————— Черновик и «печатает» —————

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const draftText = () => (context?.kind === 'edit' ? stashed : text);

  function oninput(value: string) {
    if (context?.kind !== 'edit') {
      if (value.trim()) store?.typingActive();
      else store?.typingStopped();
    }
    clearTimeout(saveTimer);
    const id = roomId;
    saveTimer = setTimeout(() => void session.saveDraft(id, draftText()), DRAFT_SAVE_MS);
  }

  function onsend(value: string) {
    if (!store) return;
    if (attachments.length && context?.kind !== 'edit') {
      // Текст — подпись к первому вложению; ответ — тоже с ним.
      store.sendFiles(attachments, value, context?.kind === 'reply' ? context.message : undefined);
      attachments = [];
      text = '';
    } else if (context?.kind === 'edit') {
      store.edit(context.message, value);
      text = stashed;
      stashed = '';
    } else {
      store.send(value, context?.kind === 'reply' ? context.message : undefined);
      text = '';
    }
    context = null;
    clearTimeout(saveTimer);
    void session.saveDraft(roomId, text);
  }

  function edit(message: Message) {
    if (!message.canEdit || !('body' in message.kind)) return;
    if (context?.kind !== 'edit') stashed = text;
    context = { kind: 'edit', message };
    text = message.kind.body;
  }

  function cancelContext() {
    if (context?.kind === 'edit') {
      text = stashed;
      stashed = '';
    }
    context = null;
  }

  // ————— Вложения —————

  /** Выбрали, вставили или перетащили — посчитать размеры и миниатюры и положить в лоток. */
  async function addFiles(files: File[]) {
    const limit = await session.uploadLimit();
    const fitting = files.filter((file) => {
      if (limit === undefined || file.size <= limit) return true;
      tooLarge = t('upload.tooLarge', { name: file.name, limit: fileSize(limit, i18n.locale) });
      return false;
    });
    if (fitting.length === files.length) tooLarge = '';
    const prepared = await Promise.all(fitting.map(prepareFile));
    attachments = [...attachments, ...prepared];
  }

  /** Перетаскивание: подсвечивается вся колонка чата, а не маленькая мишень. */
  const carriesFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  let dragDepth = 0;
  function ondragenter(event: DragEvent) {
    if (!carriesFiles(event) || !canSend) return;
    event.preventDefault();
    dragDepth++;
    dropping = true;
  }
  function ondragover(event: DragEvent) {
    if (!carriesFiles(event) || !canSend) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }
  function ondragleave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropping = false;
  }
  function ondrop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropping = false;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length && canSend) void addFiles(files);
  }

  /** `Ctrl/⌘ Shift U`. */
  export function attach(): void {
    composer?.attach();
  }

  // ————— «Печатает…» с задержкой —————

  let showTyping = $state(false);
  let typingLine = $state('');
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const names = store?.typing ?? [];
    clearTimeout(hideTimer);
    if (names.length) {
      typingLine = typingText(names);
      showTyping = true;
    } else {
      // Уведомления о наборе — поток мелкой неточности: «никто» между двумя «печатает»
      // мигало бы строкой. Прячем с небольшой задержкой.
      hideTimer = setTimeout(() => (showTyping = false), TYPING_GRACE_MS);
    }
    return () => clearTimeout(hideTimer);
  });

  // ————— Действия —————

  const actions: MessageActions = {
    get canReply() {
      return canSend;
    },
    get canPin() {
      return !!store?.canPin;
    },
    reply: (message) => {
      if (context?.kind === 'edit') text = stashed;
      context = { kind: 'reply', message };
    },
    edit,
    react: (message, key) => store?.react(message, key),
    vote: (message, ids) => store?.vote(message, ids),
    pin: (message) => store?.pin(message),
    unpin: (message) => store?.unpin(message),
    remove: (message) => (deleting = message),
    block: (message) => (blocking = message),
    retry: (key) => store?.retry(key),
    discard: (key) => store?.discard(key),
    openMenu: (message, at, sheet) => (menu = { message, at, sheet }),
    openMedia: (message) => {
      // Листается всё, что в комнате загружено: фото, видео, «кружочки» — по порядку ленты.
      const items: ViewerItem[] = (store?.messages ?? []).flatMap((m) =>
        (m.kind.type === 'image' || m.kind.type === 'video' || m.kind.type === 'videoNote') && m.kind.attachment.source
          ? [{ key: m.key, kind: m.kind.type, attachment: m.kind.attachment }]
          : [],
      );
      if (items.some((i) => i.key === message.key)) viewing = { items, start: message.key };
    },
  };

  /** `↑` в пустом композере. */
  function editLast(): boolean {
    const last = store?.lastEditable();
    if (!last) return false;
    edit(last);
    return true;
  }

  /** `Esc` в чате, когда закрывать нечего: вниз и прочитано. */
  export function escape(): void {
    timeline?.toBottom();
  }

  /** Из панели «О чате»: к закреплённому сообщению. */
  export function reveal(eventId: string): void {
    void timeline?.reveal(eventId);
  }

    /** `Page Up` / `Page Down` — листать ленту, даже когда фокус в композере. */
  export function page(direction: -1 | 1): void {
    timeline?.page(direction);
  }
</script>

<div class="room" role="region" aria-label={t('room.timeline')} {ondragenter} {ondragover} {ondragleave} {ondrop}>
  {#if dropping}
    <div class="drop" aria-hidden="true"><span>{t('room.dropToAttach')}</span></div>
  {/if}
  {#if store && store.pinnedIds.length}
    <PinnedStrip
      message={store.pinnedMessage}
      canUnpin={store.canPin}
      onjump={() => store?.pinnedMessage?.eventId && void timeline?.reveal(store.pinnedMessage.eventId)}
      onunpin={() => store?.pinnedMessage && store.unpin(store.pinnedMessage)}
    />
  {/if}
  {#if store}
    {#key store}
      <Timeline bind:this={timeline} {store} {session} showSenders={room?.kind !== 'direct'} {actions} />
    {/key}
  {/if}
  <div class="below">
    <p class="typing" aria-live="polite">{showTyping ? typingLine : ''}</p>
    {#if tooLarge}
      <div class="failure" role="alert">
        <span>{tooLarge}</span>
        <button type="button" onclick={() => (tooLarge = '')}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
    {#if store?.failure}
      <div class="failure" role="alert">
        <span>{t(`timeline.${store.failure}`)}</span>
        <button type="button" onclick={() => store?.dismissFailure()}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
    {#if session.blocked.failure === 'blockFailed'}
      <div class="failure" role="alert">
        <span>{t('account.blockFailed')}</span>
        <button type="button" onclick={() => session.blocked.dismissFailure()}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
  </div>
  <Composer
    bind:this={composer}
    bind:text
    {context}
    disabled={!canSend}
    {onsend}
    {oninput}
    oncancelcontext={cancelContext}
    oneditlast={editLast}
    {attachments}
    onfiles={(files) => void addFiles(files)}
    onremoveattachment={(index) => (attachments = attachments.filter((_, i) => i !== index))}
  />
</div>

{#if viewing}
  <Viewer items={viewing.items} start={viewing.start} media={session.media} onclose={() => (viewing = null)} />
{/if}

<MessageMenu message={menu?.message ?? null} at={menu?.at ?? { x: 0, y: 0 }} sheet={menu?.sheet ?? false} {actions} onclose={() => (menu = null)} />

<ConfirmDialog
  open={!!deleting}
  title={t('message.menu.deleteConfirmTitle')}
  message={t('message.menu.deleteConfirmMessage')}
  confirmLabel={t('message.menu.delete')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (deleting = null)}
  onconfirm={() => {
    if (deleting) store?.remove(deleting);
    deleting = null;
  }}
/>

<ConfirmDialog
  open={!!blocking}
  title={t('message.menu.blockConfirm', { name: blocking?.senderName ?? '' })}
  message={t('message.menu.blockConfirmMessage')}
  confirmLabel={t('message.menu.block')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (blocking = null)}
  onconfirm={() => {
    if (blocking) void session.blocked.block(blocking.senderId);
    blocking = null;
  }}
/>

<style>
  .room {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .drop {
    position: absolute;
    z-index: 5;
    inset: var(--space-close);
    display: grid;
    place-items: center;
    border: 2px dashed var(--accent);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--color-background) 85%, transparent);
    color: var(--accent);
    font-size: var(--font-size-title);
    font-weight: 600;
    pointer-events: none;
  }
  .below {
    max-width: var(--column-timeline-max);
    width: 100%;
    margin-inline: auto;
    padding-inline: var(--timeline-gutter);
  }
  .typing {
    min-height: calc(var(--font-size-caption) * var(--line-height-body));
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .failure {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    margin-block-end: var(--space-tight);
    padding: var(--space-close) var(--space-normal);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
  .failure span {
    flex: 1;
  }
  .failure button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
