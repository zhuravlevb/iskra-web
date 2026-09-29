<!--
  «Iskra уже открыта в другом окне». Две кнопки, ни одна не выделена как правильная:
  какая из вкладок главная, решает человек, а не мы.
-->
<script lang="ts">
  import { asset } from '../../design/asset';
  import QuietButton from '../../design/QuietButton.svelte';
  import { app } from '../../core/session/app.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
</script>

<main class="elsewhere">
  <img src={asset('icons/icon.svg')} alt="" width="56" height="56" />
  <h1>{t('elsewhere.title')}</h1>
  <p>{t('elsewhere.message')}</p>
  <div class="actions">
    <QuietButton onclick={() => app.focusOther()}>{t('elsewhere.goThere')}</QuietButton>
    <QuietButton onclick={() => void app.takeOver()}>{t('elsewhere.openHere')}</QuietButton>
  </div>
</main>

<style>
  .elsewhere {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-normal);
    max-width: var(--size-sign-in-column);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-generous);
    text-align: center;
  }
  img {
    width: var(--size-sign-in-mark);
    height: var(--size-sign-in-mark);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-title);
  }
  p {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-close);
  }
</style>
