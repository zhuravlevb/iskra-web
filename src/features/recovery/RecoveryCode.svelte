<!--
  Код восстановления — один раз и больше никогда. Три способа унести его с экрана:
  скопировать, скачать файлом, «Поделиться» (там, где браузер умеет — на телефоне это
  менеджер паролей или заметки). Кнопка «Я сохранил код» оживает только после галочки:
  не проверка, а пауза, чтобы прочитать предупреждение.
-->
<script lang="ts">
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import { t } from '../../i18n/index.svelte.ts';

  let { code, userId, onsaved }: { code: string; userId: string; onsaved: () => void } = $props();

  let copied = $state(false);
  let confirmed = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  $effect(() => () => clearTimeout(copiedTimer));

  const fileText = $derived(t('encryption.keyFileText', { user: userId, code }));

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Буфер не дали — код на экране, его можно выделить: он выделяется целиком.
      return;
    }
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 2000);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([fileText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('encryption.keyFileName')}.txt`;
    link.click();
    // Ссылка нужна ровно на время клика; сам файл браузер уже забрал.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function share() {
    await navigator.share({ title: t('encryption.keyFileName'), text: fileText }).catch(() => {});
  }
</script>

<div class="code-step">
  <h1>{t('encryption.saveKey')}</h1>
  <p class="secondary">{t('encryption.saveKeyHelp')}</p>

  <output class="code" data-testid="recovery-code">{code}</output>

  <div class="ways">
    <QuietButton onclick={copy}>{copied ? t('encryption.keyCopied') : t('encryption.copyKey')}</QuietButton>
    <QuietButton onclick={download}>{t('encryption.downloadKey')}</QuietButton>
    {#if canShare}
      <QuietButton onclick={share}>{t('encryption.shareKey')}</QuietButton>
    {/if}
  </div>

  <p class="warning">{t('recovery.save.warning')}</p>

  <label class="confirm">
    <input type="checkbox" bind:checked={confirmed} />
    <span>{t('recovery.save.confirm')}</span>
  </label>

  <PrimaryButton wide disabled={!confirmed} onclick={onsaved}>{t('encryption.saved')}</PrimaryButton>
</div>

<style>
  .code-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-large-title);
    text-wrap: balance;
  }
  .secondary,
  .warning {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .warning {
    font-size: var(--font-size-caption);
  }
  .code {
    display: block;
    padding: var(--space-roomy);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    font-family: var(--font-code);
    font-size: var(--font-size-title);
    line-height: var(--line-height-body);
    text-align: center;
    word-spacing: var(--space-tight);
    user-select: all;
  }
  .ways {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-close);
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    min-height: var(--tap-target);
    cursor: pointer;
  }
  .confirm input {
    width: var(--size-icon);
    height: var(--size-icon);
    accent-color: var(--accent);
  }
</style>
