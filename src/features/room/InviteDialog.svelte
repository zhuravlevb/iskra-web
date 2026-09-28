<!-- «Кого пригласить?» — адрес Matrix; не тот — ошибка словами нативной Искры. -->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import type { RoomDetailsStore } from '../../core/rooms/roomDetails.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { open, details, onclose }: { open: boolean; details: RoomDetailsStore; onclose: () => void } = $props();
  let address = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (await details.invite(address)) {
      address = '';
      onclose();
    }
  }
</script>

<Dialog {open} title={t('room.manage.inviteTitle')} {onclose}>
  <form onsubmit={submit}>
    <TextField
      bind:value={address}
      label={t('room.manage.invitePlaceholder')}
      placeholder={t('room.manage.invitePlaceholder')}
      autocomplete="off"
      autofocus
      invalid={details.failure === 'invite'}
    />
    <p class="help">{details.failure === 'invite' ? t('roomAction.inviteFailed') : t('room.manage.inviteHelp')}</p>
    <PrimaryButton type="submit" wide busy={details.working} disabled={!address.trim()}>{t('room.manage.inviteSend')}</PrimaryButton>
    <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
  </form>
</Dialog>

<style>
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
</style>
