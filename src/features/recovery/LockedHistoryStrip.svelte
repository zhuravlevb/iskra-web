<!--
  «Старая переписка заблокирована» — над списком чатов, пока это устройство не открыло
  резервную копию. Отложил шаг восстановления — плашка помнит за него.
-->
<script lang="ts">
  import type { RecoveryStore } from '../../core/encryption/recovery.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { recovery, onopen }: { recovery: RecoveryStore | null; onopen: () => void } = $props();
</script>

{#if recovery?.protection === 'keyNeeded'}
  <button type="button" class="locked" onclick={onopen}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" />
    </svg>
    <span>{t('recovery.banner.locked')}</span>
  </button>
{/if}

<style>
  .locked {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: none;
    background: var(--color-incoming-bubble);
    color: var(--accent);
    font-size: var(--font-size-caption);
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
  }
</style>
