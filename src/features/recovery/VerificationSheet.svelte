<!--
  Подтверждение устройства — поверх чего угодно, из корня приложения: запрос с телефона
  приходит, когда ему вздумается, и ждать, пока человек откроет нужный экран, он не будет.

  Кнопки пар («Это я» / «Это не я», «Совпадают» / «Не совпадают») одинаковые: решает
  человек, а не подсветка. Имён у эмодзи нет — сравнивают картинки.
-->
<script lang="ts">
  import type { VerificationStore } from '../../core/encryption/verification.svelte.ts';
  import PlainButton from '../../design/PlainButton.svelte';
  import { t } from '../../i18n/index.svelte.ts';

  let { verification }: { verification: VerificationStore } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();
  const step = $derived(verification.step);

  $effect(() => {
    if (!dialog) return;
    if (step && !dialog.open) dialog.showModal();
    if (!step && dialog.open) dialog.close();
  });

  /** `Esc` — то же, что «Закрыть»: идущее отменяется. */
  function onclose() {
    if (verification.step) verification.close();
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" aria-describedby="{id}-message" {onclose}>
  {#if step?.name === 'asked'}
    <h2 id="{id}-title">{t('verification.signIn.title')}</h2>
    <p class="device">{step.deviceName || t('verification.unnamedDevice')}</p>
    <p id="{id}-message">{t('verification.asked.message')}</p>
    <div class="pair">
      <PlainButton onclick={() => void verification.accept()}>{t('verification.mine')}</PlainButton>
      <PlainButton onclick={() => void verification.refuse()}>{t('verification.notMine')}</PlainButton>
    </div>
  {:else if step?.name === 'waiting'}
    <h2 id="{id}-title">{t('verification.waiting.title')}</h2>
    <p id="{id}-message">{t('verification.waiting.message')}</p>
    <span class="spinner" aria-hidden="true"></span>
    <PlainButton onclick={() => verification.close()}>{t('verification.close')}</PlainButton>
  {:else if step?.name === 'negotiating'}
    <h2 id="{id}-title">{t('verification.negotiating.title')}</h2>
    <p id="{id}-message">{t('verification.negotiating.message')}</p>
    <span class="spinner" aria-hidden="true"></span>
  {:else if step?.name === 'compare'}
    <h2 id="{id}-title">{t('verification.title')}</h2>
    <p id="{id}-message">{t('verification.compare')}</p>
    <ol class="emoji" data-testid="verification-emoji">
      {#each step.emoji as emoji, index (index)}
        <li>{emoji}</li>
      {/each}
    </ol>
    <div class="pair">
      <PlainButton onclick={() => void verification.match()}>{t('verification.match')}</PlainButton>
      <PlainButton onclick={() => verification.mismatch()}>{t('verification.noMatch')}</PlainButton>
    </div>
  {:else if step}
    {@const key = step.name}
    <h2 id="{id}-title">{t(`verification.${key}.title`)}</h2>
    <p id="{id}-message">{t(`verification.${key}.message`)}</p>
    <PlainButton onclick={() => verification.close()}>{t('verification.close')}</PlainButton>
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
  dialog[open] {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
  }
  p {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .device {
    color: var(--color-text);
    font-weight: 600;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-close);
  }
  .emoji {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-close);
    margin: 0;
    padding: var(--space-roomy);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
    font-size: var(--font-size-large-title);
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
