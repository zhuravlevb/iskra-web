<!--
  Одна строка ленты: пузырь, служебная строка или разделитель дней.

  Пузырь — непрозрачная заливка (стекло — только в навигационном слое). Своё — справа, в
  акценте; чужое — слева, нейтральной заливкой. В группе у первой строки серии — имя, у
  последней — лицо; в личном чате ни того, ни другого: и так понятно, кто говорит.

  Действия (см. план, «Ввод»): с мышью — панель по наведению (реакция, ответ, «ещё») и то же
  меню по правому щелчку; пальцем — долгое нажатие (браузер присылает его как
  `contextmenu`), двойное касание — быстрая реакция, свайп вправо — ответить. Над ссылкой и
  выделенным текстом правый щелчок остаётся браузеру: его меню там нужнее нашего.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import { clock } from '../../design/time';
  import { viewport } from '../../design/viewport.svelte.ts';
  import type { Message } from '../../core/timeline/message';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import type { MessageActions } from './actions';
  import { touchGestures } from './gestures';
  import { matrixHtml } from './html';
  import LinkedText from './LinkedText.svelte';
  import PollView from './PollView.svelte';
  import FileCard from '../media/FileCard.svelte';
  import MediaPreview from '../media/MediaPreview.svelte';
  import type { MediaLoader } from '../../core/media/media';
  import { doubleTapReaction } from './reactions';
  import { attachmentLabel, serviceText } from './text';

  interface Props {
    message: Message;
    firstInRun: boolean;
    lastInRun: boolean;
    /** Группа: показывать имена и лица собеседников. */
    showSenders: boolean;
    senderPhoto?: string;
    actions: MessageActions;
    media: MediaLoader;
  }
  let { message, firstInRun, lastInRun, showSenders, senderPhoto, actions, media }: Props = $props();

  const kind = $derived(message.kind);
  const failed = $derived(message.delivery.state === 'failed' ? message.delivery : null);
  /** С ушедшим можно что-то делать; с удалённым и служебным — нет. */
  const interactive = $derived(!!message.eventId && kind.type !== 'deleted' && kind.type !== 'service');
  /** Картинка во весь пузырь: отступы пузыря — тоньше, фон — у самой картинки. */
  const visual = $derived(kind.type === 'image' || kind.type === 'video' || kind.type === 'videoNote' || kind.type === 'sticker');

  function oncontextmenu(event: MouseEvent) {
    if (!interactive) return;
    const target = event.target as Element | null;
    if (target?.closest('a') || (window.getSelection()?.toString() ?? '') !== '') return;
    event.preventDefault();
    actions.openMenu(message, { x: event.clientX, y: event.clientY }, !viewport.finePointer);
  }

  function more(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    actions.openMenu(message, { x: rect.left, y: rect.bottom }, !viewport.finePointer);
  }

  const gestures = $derived({
    ondoubletap: () => interactive && actions.react(message, doubleTapReaction),
    onswipe: () => interactive && actions.canReply && actions.reply(message),
    onlongpress: (at: { x: number; y: number }) => interactive && actions.openMenu(message, at, true),
  });
</script>

{#if kind.type === 'service'}
  <p class="service">{serviceText(kind.event)}</p>
{:else}
  <div class="row" class:own={message.own} class:first={firstInRun} class:grouped={showSenders && !message.own} class:interactive>
    {#if showSenders && !message.own}
      <span class="face">
        {#if lastInRun}
          <Avatar name={message.senderName} seed={message.senderId} photo={senderPhoto} mode={preferences.faces} />
        {/if}
      </span>
    {/if}
    <div class="stack">
      {#if showSenders && !message.own && firstInRun}
        <span class="sender">{message.senderName}</span>
      {/if}
      <div class="bubble-wrap">
      <!-- Пузырь — `article`: запись в `role="log"` ленты. С клавиатуры меню открывает «ещё»
           (панель по наведению появляется и по фокусу), правый щелчок — дублирующий путь. -->
      <div
        class="bubble"
        class:visual
        class:bare={kind.type === 'sticker' || kind.type === 'videoNote'}
        role="article"
        class:notice={kind.type === 'notice'}
        class:muted={kind.type === 'deleted' || kind.type === 'unreadable' || kind.type === 'unsupported'}
        {oncontextmenu}
        use:touchGestures={gestures}
      >
        {#if message.replyTo}
          <span class="quote">
            {#if message.replyTo.senderName}<strong>{message.replyTo.senderName}</strong>{/if}
            {#if message.replyTo.text}<span>{message.replyTo.text}</span>{/if}
          </span>
        {/if}
        <span class="content">
          {#if (kind.type === 'text' || kind.type === 'notice') && kind.html}
            <span class="html" use:matrixHtml={kind.html}></span>
          {:else if kind.type === 'text' || kind.type === 'notice'}
            <span class="text"><LinkedText text={kind.body} /></span>
          {:else if kind.type === 'emote' && kind.html}
            <em>* {message.senderName}&#32;<span class="html" use:matrixHtml={kind.html}></span></em>
          {:else if kind.type === 'emote'}
            <em>* {message.senderName}&#32;<LinkedText text={kind.body} /></em>
          {:else if kind.type === 'deleted'}
            <em>{t('message.deleted')}</em>
          {:else if kind.type === 'unreadable'}
            <em>{t('message.unreadable')}</em>
          {:else if kind.type === 'unsupported'}
            <em>{t('message.unsupported')}</em>
          {:else if kind.type === 'poll'}
            <PollView poll={kind.poll} canVote={!!message.eventId} onvote={(ids) => actions.vote(message, ids)} />
          {:else if kind.type === 'image' || kind.type === 'video' || kind.type === 'videoNote' || kind.type === 'sticker'}
            <MediaPreview kind={kind.type} attachment={kind.attachment} {media} onopen={() => actions.openMedia(message)} />
            {#if kind.attachment.caption}<span class="caption text"><LinkedText text={kind.attachment.caption} /></span>{/if}
          {:else if kind.type === 'file' || kind.type === 'audio' || kind.type === 'voice'}
            <FileCard kind={kind.type} attachment={kind.attachment} {media} />
            {#if kind.attachment.caption}<span class="caption text"><LinkedText text={kind.attachment.caption} /></span>{/if}
          {:else}
            <span class="label">{attachmentLabel(kind)}</span>
          {/if}
          <span class="meta">
            {#if message.pinned}
              <svg class="pin" viewBox="0 0 24 24" role="img" aria-label={t('room.pinned')}><path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" /></svg>
            {/if}
            {#if message.edited}<span>{t('message.edited')}</span>{/if}
            {#if message.delivery.state === 'sending'}
              <svg class="sending" viewBox="0 0 24 24" role="img" aria-label={t('message.delivery.sending')}>
                <circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" />
              </svg>
            {:else if failed}
              <svg class="failed" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.01" /></svg>
            {/if}
            <time>{clock(message.ts, i18n.locale)}</time>
          </span>
        </span>
      </div>
        {#if interactive && viewport.finePointer}
          <!-- Панель по наведению. В порядке табуляции — только «ещё»: остальное есть в меню,
               а три остановки на каждом из сотен сообщений сделали бы Tab бесполезным. -->
          <div class="hover-bar">
            <button type="button" tabindex="-1" aria-label={t('message.menu.react', { emoji: doubleTapReaction })} title={t('message.menu.react', { emoji: doubleTapReaction })} onclick={() => actions.react(message, doubleTapReaction)}>{doubleTapReaction}</button>
            {#if actions.canReply}
              <button type="button" tabindex="-1" aria-label={t('message.menu.reply')} title={t('message.menu.reply')} onclick={() => actions.reply(message)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7L4 12l6 5M4 12h11a5 5 0 0 1 5 5v1" /></svg>
              </button>
            {/if}
            <button type="button" aria-label={t('message.menu.more')} title={t('message.menu.more')} aria-haspopup="menu" onclick={more}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>
            </button>
          </div>
        {/if}
      </div>
      {#if message.reactions.length}
        <ul class="reactions" aria-label={t('message.reactions')}>
          {#each message.reactions as reaction (reaction.key)}
            <li>
              <button
                type="button"
                class:mine={reaction.mine}
                aria-pressed={reaction.mine}
                disabled={!interactive}
                onclick={() => actions.react(message, reaction.key)}>{reaction.key} {reaction.count}</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      {#if failed}
        <div class="failure" role="alert">
          <strong>{t('message.delivery.failed')}</strong>
          <span>{t(`sendFailure.${failed.reason}`)}</span>
          <span class="actions">
            <button type="button" onclick={() => actions.discard(message.key)}>{t('message.delivery.discard')}</button>
            <button type="button" class="again" onclick={() => actions.retry(message.key)}>{t('message.delivery.sendAgain')}</button>
          </span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .service {
    margin: var(--space-close) auto;
    max-width: 80%;
    text-align: center;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    margin-block-start: var(--space-within-run);
  }
  .row.first {
    margin-block-start: var(--space-between-senders);
  }
  .row.own {
    justify-content: flex-end;
  }
  .face {
    flex: none;
    width: var(--size-message-avatar);
    --avatar-size: var(--size-message-avatar);
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-tight);
    max-width: var(--bubble-width-fraction);
    min-width: 0;
  }
  .own .stack {
    align-items: flex-end;
  }
  .sender {
    padding-inline: var(--bubble-pad-x);
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .bubble {
    max-width: 100%;
    padding: var(--bubble-pad-y) var(--bubble-pad-x);
    border-radius: var(--radius-bubble);
    background: var(--color-incoming-bubble);
    overflow-wrap: anywhere;
  }
  /* Переносы строк из сообщения сохраняются — но только в самом тексте, а не в разметке
     вокруг него. */
  .text,
  em {
    white-space: pre-wrap;
  }
  .own .bubble {
    background: var(--bubble-own);
    color: var(--on-bubble-own);
  }
  .bubble.notice .content {
    opacity: 0.8;
  }
  .bubble.muted em {
    opacity: 0.7;
  }
  .quote {
    display: flex;
    flex-direction: column;
    margin-block-end: var(--space-tight);
    padding-inline-start: var(--space-close);
    border-inline-start: var(--border-hairline) solid currentColor;
    font-size: var(--font-size-caption);
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quote span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label {
    display: block;
    font-size: var(--font-size-caption);
    font-weight: 600;
    opacity: 0.8;
  }
  /* Время и пометки — в конце последней строки текста, если там есть место. */
  .meta {
    float: inline-end;
    display: inline-flex;
    align-items: center;
    gap: var(--space-tight);
    margin-inline-start: var(--space-close);
    margin-block-start: var(--space-tight);
    font-size: var(--font-size-caption);
    line-height: 1.2;
    opacity: 0.7;
    white-space: nowrap;
  }
  .meta svg {
    width: var(--font-size-caption);
    height: var(--font-size-caption);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .meta .failed {
    color: var(--color-danger);
    opacity: 1;
  }
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-tight);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .reactions button {
    min-height: var(--size-unread-badge);
    padding: var(--space-within-run) var(--space-close);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    color: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
  }
  .reactions button.mine {
    border-color: var(--accent);
    background: var(--color-own-reaction);
  }
  .reactions button:disabled {
    cursor: default;
  }
  /* Палец: без выделения текста и системного меню по долгому нажатию — там наше меню,
     и «Скопировать» в нём есть. Горизонтальный жест — наш, вертикальный — прокрутке. */
  @media (pointer: coarse) {
    .interactive .bubble {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      touch-action: pan-y;
    }
  }
  .bubble {
    transition: transform var(--timing-chrome) ease-out;
  }
  /* По ширине картинки: подпись переносится под неё, а не растягивает пузырь. */
  .bubble.visual {
    width: min-content;
    padding: var(--space-tight);
  }
  .bubble.visual .caption {
    display: block;
    padding: var(--space-tight) var(--space-close) 0;
  }
  .bubble.visual .meta {
    margin-inline-end: var(--space-close);
  }
  /* Стикер и «кружочек» — без пузыря: у них своя форма. */
  .bubble.bare,
  .own .bubble.bare {
    padding: 0;
    background: transparent;
    color: var(--color-text);
  }
  .bubble-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: inherit;
    max-width: 100%;
    min-width: 0;
  }
  /* Сбоку от пузыря, по его середине, — в пустоте ленты: не закрывает ни имя, ни текст,
     ни время. У широкого пузыря может уйти за край колонки — лента его подрежет. */
  .hover-bar {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: calc(100% + var(--space-tight));
    translate: 0 -50%;
    /* Не `display: none`: спрятанное так не получает фокус, и «ещё» стало бы недоступно
       с клавиатуры. Прозрачная и не ловит мышь — пока над строкой не навели или не
       пришли табуляцией. */
    display: flex;
    opacity: 0;
    pointer-events: none;
    gap: var(--space-within-run);
    padding: var(--space-within-run);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-circle);
    background: var(--color-glass-opaque);
    box-shadow: 0 var(--space-within-run) var(--space-close) rgb(0 0 0 / 0.12);
    z-index: 1;
  }
  .own .hover-bar {
    inset-inline-start: auto;
    inset-inline-end: calc(100% + var(--space-tight));
  }
  .row:hover .hover-bar,
  .row:focus-within .hover-bar {
    opacity: 1;
    pointer-events: auto;
  }
  .hover-bar button {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }
  .hover-bar button:hover {
    background: var(--color-selected);
  }
  .hover-bar svg,
  .meta .pin {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .meta .pin {
    width: var(--font-size-caption);
    height: var(--font-size-caption);
  }
  /* HTML сообщения: разметка Matrix, но в масштабе пузыря. */
  .html :global(p),
  .html :global(ul),
  .html :global(ol),
  .html :global(blockquote),
  .html :global(pre) {
    margin: 0 0 var(--space-tight);
  }
  .html :global(ul),
  .html :global(ol) {
    padding-inline-start: var(--space-generous);
  }
  .html :global(blockquote) {
    padding-inline-start: var(--space-close);
    border-inline-start: var(--border-hairline) solid currentColor;
    opacity: 0.85;
  }
  .html :global(code),
  .html :global(pre) {
    font-family: var(--font-code);
    font-size: var(--font-size-caption);
  }
  .html :global(pre) {
    padding: var(--space-close);
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
    overflow-x: auto;
    white-space: pre;
  }
  .html :global(a) {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  .html :global(.mention) {
    font-weight: 600;
  }
  .html :global(.spoiler) {
    background: currentColor;
    border-radius: var(--radius-control);
    transition: background var(--timing-chrome);
  }
  .html :global(.spoiler:hover),
  .html :global(.spoiler:focus) {
    background: transparent;
  }
  .failure {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-tight);
    max-width: 100%;
    font-size: var(--font-size-caption);
    color: var(--color-danger);
    text-align: end;
  }
  .failure span:not(.actions) {
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    gap: var(--space-close);
  }
  .actions button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    cursor: pointer;
  }
  .actions .again {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
