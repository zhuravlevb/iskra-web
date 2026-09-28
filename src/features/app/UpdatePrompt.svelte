<!--
  «Доступна новая версия». Вкладку на десктопе не закрывают неделями, и без подсказки
  человек сидит на старой версии. Но перезагрузка — только по нажатию, не сама посреди
  набора сообщения.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '../../design/Banner.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import { t } from '../../i18n/index.svelte.ts';
  import { appUpdate } from './serviceWorker.svelte.ts';

  onMount(() => appUpdate.register());
</script>

{#if appUpdate.available}
  <Banner message={t('update.available')}>
    {#snippet action()}
      <PrimaryButton onclick={() => appUpdate.apply()}>{t('update.reload')}</PrimaryButton>
    {/snippet}
  </Banner>
{/if}
