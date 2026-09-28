<!--
  «Изменить чат»: название, описание, фото, открытость — только то, на что есть право.
  Фото чата уходит открыто: оно в состоянии комнаты, которое Matrix не шифрует.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import type { RoomDetailsStore } from '../../core/rooms/roomDetails.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { open, details, session, onclose }: { open: boolean; details: RoomDetailsStore; session: UserSession; onclose: () => void } = $props();

  let name = $state('');
  let topic = $state('');
  let isOpen = $state(false);
  let picker: HTMLInputElement | undefined = $state();
  const id = $props.id();

  // Открыли — поля заполняются тем, что сейчас; правки прошлого раза не висят.
  $effect(() => {
    if (!open) return;
    name = details.name;
    topic = details.topic;
    isOpen = details.open;
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const p = details.permissions;
    const done =
      (!p.canRename || (await details.rename(name))) &&
      (!p.canChangeTopic || (await details.setTopic(topic))) &&
      (!p.canChangeVisibility || (await details.setOpen(isOpen)));
    if (done) onclose();
  }

  async function picked() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const mxc = await session.uploadPublic(file, file.name, file.type);
      await details.setPicture(mxc);
    } catch {
      details.failure = 'picture';
    }
  }
</script>

<Dialog {open} title={t('room.manage.editTitle')} {onclose}>
  <form onsubmit={save}>
    {#if details.permissions.canChangePicture}
      <div class="picture">
        <PlainButton onclick={() => picker?.click()}>{t('room.manage.changePicture')}</PlainButton>
        {#if details.avatarUrl}
          <PlainButton danger onclick={() => void details.setPicture(null)}>{t('room.manage.removePicture')}</PlainButton>
        {/if}
        <input bind:this={picker} type="file" accept="image/*" hidden onchange={picked} />
      </div>
    {/if}
    {#if details.permissions.canRename}
      <TextField bind:value={name} label={t('room.manage.nameHeader')} showLabel placeholder={t('room.manage.namePlaceholder')} />
    {/if}
    {#if details.permissions.canChangeTopic}
      <div class="field">
        <label for="{id}-topic">{t('room.about')}</label>
        <textarea id="{id}-topic" bind:value={topic} rows="3" placeholder={t('room.manage.topicPlaceholder')}></textarea>
      </div>
    {/if}
    {#if details.permissions.canChangeVisibility}
      <label class="toggle">
        <input type="checkbox" bind:checked={isOpen} />
        <span>
          <strong>{t('room.manage.openToAnyone')}</strong>
          <span class="help">{t('room.manage.openToAnyoneHelp')}</span>
          {#if isOpen && details.encrypted}<span class="help">{t('roomList.new.openMeansUnencrypted')}</span>{/if}
        </span>
      </label>
    {/if}
    {#if details.failure}
      <p class="problem" role="alert">{t(`roomAction.${details.failure}Failed`)}</p>
    {/if}
    <PrimaryButton type="submit" wide busy={details.working}>{t('room.manage.save')}</PrimaryButton>
    <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
  </form>
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .picture {
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-close);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  label {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  textarea {
    padding: var(--space-normal) var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    background: var(--color-background);
    resize: vertical;
  }
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: transparent;
  }
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: var(--space-close);
    color: var(--color-text);
    font-size: var(--font-size-body);
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
  .help {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
</style>
