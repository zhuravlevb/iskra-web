<!--
  «Новый чат или комната». Чат — по адресу Matrix, зашифрован с первого сообщения; с тем, с
  кем чат уже есть, откроется тот же. Комната — с названием; открытую читает каждый, кто
  вошёл, поэтому шифрования в ней нет, и это сказано прямо (нативная Искра).
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { isMatrixId } from '../../core/rooms/create';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { open, session, onclose }: { open: boolean; session: UserSession; onclose: () => void } = $props();

  let kind = $state<'chat' | 'room'>('chat');
  let address = $state('');
  let name = $state('');
  let isOpen = $state(false);
  let busy = $state(false);
  let failed = $state(false);

  $effect(() => {
    if (!open) return;
    kind = 'chat';
    address = '';
    name = '';
    isOpen = false;
    failed = false;
  });

  const ready = $derived(kind === 'chat' ? isMatrixId(address) : name.trim() !== '');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!ready) return;
    busy = true;
    failed = false;
    try {
      const roomId = kind === 'chat' ? await session.createDirect(address) : await session.createGroup(name, isOpen);
      onclose();
      router.go({ name: 'room', roomId });
    } catch {
      failed = true;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} title={t('roomList.newConversation')} {onclose}>
  <div class="tabs" role="tablist">
    <button type="button" role="tab" aria-selected={kind === 'chat'} onclick={() => (kind = 'chat')}>{t('roomList.newChat')}</button>
    <button type="button" role="tab" aria-selected={kind === 'room'} onclick={() => (kind = 'room')}>{t('roomList.newRoom')}</button>
  </div>
  <form onsubmit={submit}>
    {#if kind === 'chat'}
      <TextField bind:value={address} label={t('roomList.new.who')} showLabel placeholder={t('room.manage.invitePlaceholder')} autocomplete="off" autofocus />
      <p class="help">{t('roomList.new.whoHelp')}</p>
    {:else}
      <TextField bind:value={name} label={t('room.manage.nameHeader')} showLabel placeholder={t('room.manage.namePlaceholder')} autofocus />
      <label class="toggle">
        <input type="checkbox" bind:checked={isOpen} />
        <span>
          <strong>{t('room.manage.openToAnyone')}</strong>
          <span class="help">{t('room.manage.openToAnyoneHelp')}</span>
        </span>
      </label>
      <p class="help">{t('roomList.new.openMeansUnencrypted')}</p>
    {/if}
    {#if failed}<p class="problem" role="alert">{t('roomAction.createFailed')}</p>{/if}
    <PrimaryButton type="submit" wide {busy} disabled={!ready}>{kind === 'chat' ? t('roomList.new.start') : t('roomList.new.create')}</PrimaryButton>
    <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
  </form>
</Dialog>

<style>
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: var(--space-within-run);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }
  .tabs button {
    min-height: var(--tap-target);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    background: var(--color-background);
    font-weight: 600;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .help {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: var(--space-close);
    cursor: pointer;
  }
  .toggle input {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    margin-block-start: var(--space-within-run);
    accent-color: var(--accent);
  }
  .toggle > span {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
</style>
