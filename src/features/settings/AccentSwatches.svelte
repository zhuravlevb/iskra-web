<!--
  Цвет приложения — ряд образцов, каждый своим акцентом (`data-accent` задаёт `--accent`,
  см. accent.css). Один и тот же в настройках и в первом запуске, как `AccentSwatches`
  нативной Искры: выбор пишется в настройки сразу, и экран перекрашивается под пальцем.
-->
<script lang="ts">
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { accents, preferences, type Accent } from '../app/preferences.svelte.ts';

  let { labelledby }: { labelledby: string } = $props();
  const accentLabel = (accent: Accent): TextKey => `appearance.color.${accent}`;
</script>

<div class="swatches" role="radiogroup" aria-labelledby={labelledby}>
  {#each accents as accent (accent)}
    <button
      type="button"
      role="radio"
      class="swatch"
      data-accent={accent}
      aria-checked={preferences.accent === accent}
      aria-label={t(accentLabel(accent))}
      title={t(accentLabel(accent))}
      onclick={() => (preferences.accent = accent)}
    ></button>
  {/each}
</div>

<style>
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-close);
  }
  .swatch {
    width: var(--tap-target);
    height: var(--tap-target);
    border: 2px solid transparent;
    border-radius: var(--radius-circle);
    background: var(--accent-light);
    background-clip: content-box;
    padding: var(--space-tight);
    cursor: pointer;
  }
  .swatch[aria-checked='true'] {
    border-color: var(--accent-light);
  }
</style>
