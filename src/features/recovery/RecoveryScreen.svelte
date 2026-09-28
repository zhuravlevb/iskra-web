<!--
  Шаг между входом и чатами — во весь экран, как вход: о переписке человек думает здесь,
  а не в углу списка чатов. Логика — в `recoveryFlow.svelte.ts`; здесь только то, что видно.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { RecoveryStore } from '../../core/encryption/recovery.svelte.ts';
  import type { VerificationStore } from '../../core/encryption/verification.svelte.ts';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import { t } from '../../i18n/index.svelte.ts';
  import AuthDialog from './AuthDialog.svelte';
  import RecoveryCode from './RecoveryCode.svelte';
  import { RecoveryFlow } from './recoveryFlow.svelte.ts';

  interface Props {
    recovery: RecoveryStore;
    verification: VerificationStore | null;
    userId: string;
    ondone: () => void;
  }
  let { recovery, verification, userId, ondone }: Props = $props();

  // Поток живёт, пока открыт экран: закрыли — начнём заново с того, что скажет сервер.
  // svelte-ignore state_referenced_locally
  const flow = new RecoveryFlow(recovery, verification, ondone);

  onMount(() => {
    void flow.begin();
  });

  /** Закрыть можно везде, где ничего не идёт и не показан код, которого больше не будет. */
  const closable = $derived(!['preparing', 'creating', 'code', 'startingOver'].includes(flow.step));
  const busy = $derived(recovery.working);

  function unlock(event: SubmitEvent) {
    event.preventDefault();
    void flow.unlock();
  }
</script>

<main class="recovery">
  {#if closable}
    <div class="close">
      <IconButton label={t('recovery.close')} onclick={() => flow.close()}><Icon name="close" /></IconButton>
    </div>
  {/if}

  {#if flow.step === 'preparing' || flow.step === 'done'}
    <div class="waiting" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p class="secondary">{t('recovery.preparing')}</p>
    </div>
  {:else if flow.step === 'creating'}
    <div class="step" role="status">
      <h1>{t('recovery.creating.title')}</h1>
      <p class="secondary">{t('recovery.creating.message')}</p>
      <span class="spinner" aria-hidden="true"></span>
    </div>
  {:else if flow.step === 'code' && flow.code}
    <RecoveryCode code={flow.code} {userId} onsaved={() => flow.savedCode()} />
  {:else if flow.step === 'choose'}
    <div class="step">
      <h1>{t('recovery.choose.title')}</h1>
      <p class="secondary">{t('recovery.choose.message')}</p>
      <!-- Два равных пути: ни один не подсвечен. -->
      <PlainButton onclick={() => flow.chooseCode()}>{t('recovery.choose.haveCode')}</PlainButton>
      {#if verification}
        <PlainButton onclick={() => flow.confirmFromAnotherDevice()}>{t('recovery.choose.otherDevice')}</PlainButton>
      {/if}
      <QuietButton onclick={() => void flow.lostTheCode()}>{t('recovery.choose.neither')}</QuietButton>
    </div>
  {:else if flow.step === 'entering'}
    <form class="step" onsubmit={unlock}>
      <h1>{t('recovery.enter.title')}</h1>
      <p class="secondary">{t('recovery.enter.message')}</p>
      <TextField
        bind:value={flow.typedCode}
        label={t('encryption.keyPlaceholder')}
        placeholder={t('encryption.keyPlaceholder')}
        autocomplete="off"
        autofocus
        disabled={busy}
        invalid={recovery.failure === 'restoreFailed' || recovery.failure === 'staleCodeFailed'}
      />
      <PrimaryButton type="submit" wide {busy} disabled={!flow.typedCode.trim()}>{t('recovery.enter.unlock')}</PrimaryButton>
      <QuietButton disabled={busy} onclick={() => void flow.lostTheCode()}>{t('recovery.enter.lost')}</QuietButton>
    </form>
  {:else if flow.step === 'lost' && flow.hasOtherDevices && verification}
    <div class="step">
      <h1>{t('recovery.lost.title')}</h1>
      <p class="secondary">{t('recovery.lost.hasDevices')}</p>
      <PrimaryButton wide onclick={() => flow.recoverWithAnotherDevice()}>{t('recovery.choose.otherDevice')}</PrimaryButton>
      <QuietButton onclick={() => flow.noAccessToOtherDevice()}>{t('recovery.lost.noAccess')}</QuietButton>
    </div>
  {:else if flow.step === 'lost'}
    <div class="step">
      <h1>{t('recovery.lost.alone.title')}</h1>
      <p class="secondary">{t('recovery.lost.alone.message')}</p>
      <p class="secondary">{t('recovery.lost.alone.notPassword')}</p>
      <PlainButton danger {busy} onclick={() => void flow.startOver()}>{t('recovery.lost.alone.start')}</PlainButton>
    </div>
  {:else if flow.step === 'confirmNew'}
    <div class="step">
      <h1>{t('recovery.new.title')}</h1>
      <p class="secondary">{t('recovery.new.message')}</p>
      <PlainButton danger {busy} onclick={() => void flow.confirmNewCode()}>{t('recovery.new.confirm')}</PlainButton>
      <PlainButton disabled={busy} onclick={() => flow.keepOldCode()}>{t('recovery.new.keepOld')}</PlainButton>
    </div>
  {:else if flow.step === 'startingOver'}
    <div class="waiting" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p class="secondary">{t('recovery.startingOver')}</p>
    </div>
  {/if}

  {#if recovery.failure}
    <ProblemPanel message={t(`account.${recovery.failure}`)} />
  {/if}
</main>

<AuthDialog
  request={recovery.authRequest}
  onpassword={(password) => recovery.answerPassword(password)}
  onapproved={() => recovery.answerApproved()}
  oncancel={() => recovery.cancelAuth()}
/>

<style>
  .recovery {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-generous);
    width: 100%;
    max-width: var(--size-sign-in-column);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-generous);
    padding-block-start: max(var(--space-generous), env(safe-area-inset-top));
  }
  .close {
    position: absolute;
    inset-block-start: max(var(--space-close), env(safe-area-inset-top));
    inset-inline-end: var(--space-close);
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .waiting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-normal);
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-large-title);
    text-wrap: balance;
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .spinner {
    align-self: center;
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    border: 2px solid var(--color-text-secondary);
    border-inline-end-color: transparent;
    border-radius: var(--radius-circle);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
</style>
