<!--
  Место в ленте — карточка с координатами, а не карта (см. план, «Геопозиция»): любая карта —
  это запросы тайлов к чужому серверу, и в них координаты того, кто прислал. Открыть карту —
  явный переход: на телефоне — `geo:`, то есть приложение карт, которое человек выбрал сам;
  везде — по ссылке в OpenStreetMap, Яндекс или Google, в новой вкладке.
-->
<script lang="ts">
  import { viewport } from '../../design/viewport.svelte.ts';
  import type { Place } from '../../core/timeline/location';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { distance } from './distance';

  let { place }: { place: Place } = $props();

  const lat = $derived(place.latitude.toFixed(6));
  const lon = $derived(place.longitude.toFixed(6));
  const shown = $derived(
    new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(place.latitude) +
      ', ' +
      new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(place.longitude),
  );
  const maps = $derived([
    { label: t('location.osm'), href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}` },
    { label: t('location.yandex'), href: `https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map` },
    { label: t('location.google'), href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` },
  ]);
</script>

<span class="place">
  <span class="head">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
    <strong>{t('location.title')}</strong>
  </span>
  <span class="coords">
    {shown}{#if place.accuracy !== undefined}<span class="within">{t('location.within', { distance: distance(place.accuracy, i18n.locale) })}</span>{/if}
  </span>
  <span class="links">
    {#if !viewport.finePointer}
      <a href="geo:{lat},{lon}">{t('location.openInMaps')}</a>
    {/if}
    {#each maps as map (map.href)}
      <a href={map.href} target="_blank" rel="noopener noreferrer">{map.label}</a>
    {/each}
  </span>
</span>

<style>
  .place {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    min-width: min(var(--size-menu-width), 100%);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
  }
  .head svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .coords {
    font-variant-numeric: tabular-nums;
  }
  .within {
    margin-inline-start: var(--space-close);
    font-size: var(--font-size-caption);
    opacity: 0.7;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-tight) var(--space-normal);
    font-size: var(--font-size-caption);
  }
  .links a {
    color: inherit;
    text-decoration: underline;
  }
</style>
