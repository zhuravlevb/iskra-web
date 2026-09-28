<!--
  Меню сообщения — одно на ленту: правый щелчок, «ещё» по наведению, долгое нажатие.
  Сверху — шесть быстрых реакций, под ними действия, внизу — когда отправлено.
-->
<script lang="ts">
  import Menu from '../../design/Menu.svelte';
  import { clock } from '../../design/time';
  import type { Message } from '../../core/timeline/message';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import type { MessageActions } from './actions';
  import { quickReactions } from './reactions';

  interface Props {
    message: Message | null;
    at: { x: number; y: number };
    sheet: boolean;
    actions: MessageActions;
    onclose: () => void;
  }
  let { message, at, sheet, actions, onclose }: Props = $props();

  const text = $derived(message && 'body' in message.kind ? message.kind.body : '');

  /** Пункт делает своё и закрывает меню — до действия: фокус вернётся туда, где был. */
  function run(action: (m: Message) => void) {
    const target = message;
    onclose();
    if (target) action(target);
  }
</script>

<Menu open={!!message} x={at.x} y={at.y} {sheet} label={t('message.menu.more')} {onclose}>
  {#if message}
    <div class="reactions" role="group" aria-label={t('message.menu.addReaction')}>
      {#each quickReactions as emoji (emoji)}
        {@const mine = message.reactions.some((r) => r.key === emoji && r.mine)}
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={mine}
          class:mine
          aria-label={mine ? t('message.menu.removeReaction') : t('message.menu.react', { emoji })}
          onclick={() => run((m) => actions.react(m, emoji))}>{emoji}</button
        >
      {/each}
    </div>
    {#if actions.canReply}
      <button type="button" role="menuitem" onclick={() => run(actions.reply)}>{t('message.menu.reply')}</button>
    {/if}
    {#if message.canEdit}
      <button type="button" role="menuitem" onclick={() => run(actions.edit)}>{t('message.menu.edit')}</button>
    {/if}
    {#if text}
      <button type="button" role="menuitem" onclick={() => run(() => void navigator.clipboard?.writeText(text).catch(() => {}))}>
        {t('message.menu.copy')}
      </button>
    {/if}
    {#if actions.canPin}
      {#if message.pinned}
        <button type="button" role="menuitem" onclick={() => run(actions.unpin)}>{t('message.menu.unpin')}</button>
      {:else}
        <button type="button" role="menuitem" onclick={() => run(actions.pin)}>{t('message.menu.pin')}</button>
      {/if}
    {/if}
    {#if message.canDelete}
      <button type="button" role="menuitem" class="danger" onclick={() => run(actions.remove)}>{t('message.menu.delete')}</button>
    {/if}
    <p class="sent">{t('message.menu.sentAt', { time: clock(message.ts, i18n.locale) })}</p>
  {/if}
</Menu>

<style>
  .reactions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-tight);
    padding-block-end: var(--space-tight);
    margin-block-end: var(--space-tight);
    border-block-end: var(--border-hairline) solid var(--color-separator);
  }
  .reactions button {
    justify-content: center;
    min-width: var(--tap-target);
    padding: 0;
    border-radius: var(--radius-circle);
    font-size: var(--font-size-title);
  }
  .reactions button.mine {
    background: var(--color-own-reaction);
  }
  .sent {
    margin: var(--space-tight) 0 0;
    padding: var(--space-tight) var(--space-normal) 0;
    border-block-start: var(--border-hairline) solid var(--color-separator);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
</style>
