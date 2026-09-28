<!--
  Одна строка ленты: пузырь, служебная строка или разделитель дней.

  Пузырь — непрозрачная заливка (стекло — только в навигационном слое). Своё — справа, в
  акценте; чужое — слева, нейтральной заливкой. В группе у первой строки серии — имя, у
  последней — лицо; в личном чате ни того, ни другого: и так понятно, кто говорит.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import { clock } from '../../design/time';
  import type { Message } from '../../core/timeline/message';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import LinkedText from './LinkedText.svelte';
  import { attachmentLabel, serviceText } from './text';

  interface Props {
    message: Message;
    firstInRun: boolean;
    lastInRun: boolean;
    /** Группа: показывать имена и лица собеседников. */
    showSenders: boolean;
    senderPhoto?: string;
    onretry: (key: string) => void;
    ondiscard: (key: string) => void;
  }
  let { message, firstInRun, lastInRun, showSenders, senderPhoto, onretry, ondiscard }: Props = $props();

  const kind = $derived(message.kind);
  const failed = $derived(message.delivery.state === 'failed' ? message.delivery : null);
</script>

{#if kind.type === 'service'}
  <p class="service">{serviceText(kind.event)}</p>
{:else}
  <div class="row" class:own={message.own} class:first={firstInRun} class:grouped={showSenders && !message.own}>
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
      <div class="bubble" class:notice={kind.type === 'notice'} class:muted={kind.type === 'deleted' || kind.type === 'unreadable' || kind.type === 'unsupported'}>
        {#if message.replyTo}
          <span class="quote">
            {#if message.replyTo.senderName}<strong>{message.replyTo.senderName}</strong>{/if}
            {#if message.replyTo.text}<span>{message.replyTo.text}</span>{/if}
          </span>
        {/if}
        <span class="content">
          {#if kind.type === 'text' || kind.type === 'notice'}
            <span class="text"><LinkedText text={kind.body} /></span>
          {:else if kind.type === 'emote'}
            <em>* {message.senderName}&#32;<LinkedText text={kind.body} /></em>
          {:else if kind.type === 'deleted'}
            <em>{t('message.deleted')}</em>
          {:else if kind.type === 'unreadable'}
            <em>{t('message.unreadable')}</em>
          {:else if kind.type === 'unsupported'}
            <em>{t('message.unsupported')}</em>
          {:else if kind.type === 'poll'}
            <span class="label">{t('preview.poll')}</span>
            <strong class="question">{kind.poll.question}</strong>
            <ol class="answers">
              {#each kind.poll.answers as answer (answer.id)}<li>{answer.text}</li>{/each}
            </ol>
          {:else}
            <span class="label">{attachmentLabel(kind)}</span>
            {#if 'attachment' in kind && kind.attachment.body && kind.type === 'file'}
              {kind.attachment.body}
            {/if}
          {/if}
          <span class="meta">
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
      {#if message.reactions.length}
        <ul class="reactions" aria-label={t('message.reactions')}>
          {#each message.reactions as reaction (reaction.key)}
            <li class:mine={reaction.mine}>{reaction.key} {reaction.count}</li>
          {/each}
        </ul>
      {/if}
      {#if failed}
        <div class="failure" role="alert">
          <strong>{t('message.delivery.failed')}</strong>
          <span>{t(`sendFailure.${failed.reason}`)}</span>
          <span class="actions">
            <button type="button" onclick={() => ondiscard(message.key)}>{t('message.delivery.discard')}</button>
            <button type="button" class="again" onclick={() => onretry(message.key)}>{t('message.delivery.sendAgain')}</button>
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
  .question {
    display: block;
  }
  .answers {
    margin: var(--space-tight) 0 0;
    padding-inline-start: var(--space-generous);
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
  .reactions li {
    padding: var(--space-within-run) var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    font-size: var(--font-size-caption);
  }
  .reactions li.mine {
    background: var(--color-own-reaction);
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
