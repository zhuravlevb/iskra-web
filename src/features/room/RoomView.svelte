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
  import type { Message } from '../../core/timeline/message';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import type { ComposerContext, MessageActions } from './actions';
  import Composer from './Composer.svelte';
  import MessageMenu from './MessageMenu.svelte';
  import PinnedStrip from './PinnedStrip.svelte';
  import { typingText } from './text';
  import Timeline from './Timeline.svelte';

  let { session, roomId }: { session: UserSession; roomId: string } = $props();

  /** Сколько «печатает…» держится после того, как все перестали: сообщение вот-вот придёт. */
  const TYPING_GRACE_MS = 700;
  const DRAFT_SAVE_MS = 400;

  let store = $state<TimelineStore>();
  let composer: Composer | undefined = $state();
  let timeline: Timeline | undefined = $state();

  let text = $state('');
  let context = $state<ComposerContext>(null);
  /** Черновик, отложенный на время правки: правка — не черновик. */
  let stashed = '';
  let menu = $state<{ message: Message; at: { x: number; y: number }; sheet: boolean } | null>(null);
  let deleting = $state<Message | null>(null);

  $effect(() => {
    const id = roomId;
    const created = session.timeline(id);
    store = created;
    text = '';
    context = null;
    stashed = '';
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
    if (context?.kind === 'edit') {
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
    retry: (key) => store?.retry(key),
    discard: (key) => store?.discard(key),
    openMenu: (message, at, sheet) => (menu = { message, at, sheet }),
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

  /** `Page Up` / `Page Down` — листать ленту, даже когда фокус в композере. */
  export function page(direction: -1 | 1): void {
    timeline?.page(direction);
  }
</script>

<div class="room">
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
    {#if store?.failure}
      <div class="failure" role="alert">
        <span>{t(`timeline.${store.failure}`)}</span>
        <button type="button" onclick={() => store?.dismissFailure()}>{t('timeline.dismiss')}</button>
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
  />
</div>

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

<style>
  .room {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
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
