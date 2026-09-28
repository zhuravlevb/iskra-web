<!--
  Хранилище, которое браузер может стереть (см. `core/storage/persistence.ts`):
  Firefox — объяснить и попросить; Safari во вкладке — позвать в Dock.
-->
<script lang="ts">
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import { app } from '../../core/session/app.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
</script>

{#if app.persistence === 'explain-then-ask' || app.persistence === 'install-to-dock'}
  <aside class="notice" aria-labelledby="storage-notice-title">
    {#if app.persistence === 'explain-then-ask'}
      <strong id="storage-notice-title">{t('storage.persist.title')}</strong>
      <p>{t('storage.persist.message')}</p>
      <div class="actions">
        <QuietButton onclick={() => app.dismissPersistence()}>{t('storage.later')}</QuietButton>
        <PrimaryButton onclick={() => void app.askPersistence()}>{t('storage.persist.allow')}</PrimaryButton>
      </div>
    {:else}
      <strong id="storage-notice-title">{t('storage.dock.title')}</strong>
      <p>{t('storage.dock.message')}</p>
      <div class="actions">
        <QuietButton onclick={() => app.dismissPersistence()}>{t('storage.later')}</QuietButton>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .notice {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    margin: var(--space-close);
    padding: var(--space-normal);
    border-radius: var(--radius-card);
    background: var(--color-background);
    border: var(--border-hairline) solid var(--color-separator);
    font-size: var(--font-size-caption);
  }
  p {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-close);
  }
</style>
