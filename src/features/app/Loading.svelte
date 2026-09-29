<!-- Пока поднимается сессия: иконка по центру, для скринридера — «Открываем Iskra…». -->
<script lang="ts">
  import { asset } from '../../design/asset';
  import { t } from '../../i18n/index.svelte.ts';
</script>

<main class="loading" aria-busy="true">
  <img src={asset('icons/icon.svg')} alt="" width="56" height="56" />
  <p class="visually-hidden" role="status">{t('app.loading')}</p>
</main>

<style>
  .loading {
    display: grid;
    place-items: center;
    height: 100%;
  }
  img {
    width: var(--size-sign-in-mark);
    height: var(--size-sign-in-mark);
    opacity: 0.6;
  }
</style>
