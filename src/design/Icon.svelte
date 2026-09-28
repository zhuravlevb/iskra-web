<!--
  Иконки — свои SVG, в разметке. Никаких шрифтов иконок с CDN.
  Штрих — `currentColor`, чтобы иконка брала цвет кнопки.
-->
<script lang="ts" module>
  const paths = {
    back: 'M15 5l-7 7 7 7',
    info: 'M12 11v6M12 7.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    close: 'M6 6l12 12M18 6L6 18',
  } as const;
  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]} />
</svg>
