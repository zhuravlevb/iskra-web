<!-- Состояние сети видно: тихая полоса, а не молчание. -->
<script lang="ts">
  import QuietButton from '../../design/QuietButton.svelte';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { session }: { session: UserSession } = $props();
</script>

{#if session.connection === 'offline'}
  <div class="offline" role="status">
    <span class="text">
      <strong>{t('session.offlineTitle')}</strong>
      <span>{t('session.offlineMessage')}</span>
    </span>
    <QuietButton onclick={() => session.retry()}>{t('session.tryAgain')}</QuietButton>
  </div>
{/if}

<style>
  .offline {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    padding: var(--space-close) var(--space-normal);
    background: var(--color-incoming-bubble);
    font-size: var(--font-size-caption);
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .text span {
    color: var(--color-text-secondary);
  }
</style>
