<!--
  Вопрос сервера посреди «Начать заново»: пароль — или одобрение на его странице (MAS).
  Закрыть (`Esc`, «Отмена», «Я передумал») — ничего не выбрасывается.
-->
<script lang="ts">
  import type { AuthRequest } from '../../core/encryption/recovery.svelte.ts';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    request: AuthRequest | null;
    onpassword: (password: string) => void;
    onapproved: () => void;
    oncancel: () => void;
  }
  let { request, onpassword, onapproved, oncancel }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let password = $state('');
  const id = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (request && !dialog.open) {
      password = '';
      dialog.showModal();
    }
    if (!request && dialog.open) dialog.close();
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (password) onpassword(password);
  }

  /** Закрыли сами (`Esc`) — это «передумал». Закрыли мы, потому что ответ ушёл, — нет. */
  function onclose() {
    if (request) oncancel();
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" aria-describedby="{id}-message" {onclose}>
  {#if request?.kind === 'password'}
    <form onsubmit={submit}>
      <h2 id="{id}-title">{t('recovery.password.title')}</h2>
      <p id="{id}-message">{t('recovery.password.message')}</p>
      <TextField
        bind:value={password}
        label={t('recovery.password.placeholder')}
        placeholder={t('recovery.password.placeholder')}
        type="password"
        autocomplete="current-password"
        autofocus
      />
      <div class="actions">
        <PrimaryButton type="submit" wide disabled={!password}>{t('recovery.password.confirm')}</PrimaryButton>
        <PlainButton onclick={oncancel}>{t('common.cancel')}</PlainButton>
      </div>
    </form>
  {:else if request?.kind === 'approve'}
    <h2 id="{id}-title">{t('recovery.approve.title')}</h2>
    <p id="{id}-message">{t('recovery.approve.message')}</p>
    <div class="actions">
      {#if request.url}
        <a class="open" href={request.url} target="_blank" rel="noopener noreferrer">{t('recovery.approve.open')}</a>
      {/if}
      <PlainButton danger onclick={onapproved}>{t('recovery.approve.confirm')}</PlainButton>
      <PlainButton onclick={oncancel}>{t('recovery.approve.cancel')}</PlainButton>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--size-sign-in-column));
    padding: var(--space-generous);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  form,
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
  }
  p {
    margin: 0 0 var(--space-close);
    color: var(--color-text-secondary);
  }
  .open {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: max(var(--tap-target), var(--size-navigation-bar));
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    text-decoration: none;
  }
</style>
