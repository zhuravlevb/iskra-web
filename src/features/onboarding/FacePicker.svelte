<!--
  Кому рисовать мордочки — один ползунок на три положения (`FaceModePicker` нативной Искры).
  Под ним — два человека, и они здесь не для красоты: положения отличаются только тем, как
  обходятся с двумя видами людей — с тем, кто поставил аватарку, и с тем, кто нет. С одним
  лицом разницы между вторым и третьим не показать.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { preferences, type FaceMode } from '../app/preferences.svelte.ts';

  /** По порядку ползунка: аватарки → аватарки и мордочки → мордочки. */
  const stops: Array<{ mode: FaceMode; key: 'pictures' | 'mixed' | 'faces' }> = [
    { mode: 'initials', key: 'pictures' },
    { mode: 'creatures', key: 'mixed' },
    { mode: 'creaturesAlways', key: 'faces' },
  ];
  const position = $derived(Math.max(0, stops.findIndex((s) => s.mode === preferences.faces)));
  const label = (key: string): TextKey => `onboarding.faces.${key}` as TextKey;
  const help = (key: string): TextKey => `onboarding.faces.${key}Help` as TextKey;
  const current = $derived(stops[position]!);

  // «С аватаркой» — нарисованная аватарка, а не чья-то фотография: у Ксении её нет.
  const pictured = $derived(preferences.faces === 'creaturesAlways');
</script>

<div class="picker">
  <div class="faces">
    <figure>
      <span class="avatar">
        {#if pictured}
          <Avatar name={t('onboarding.faces.picturedName')} seed="@chloe:iskra.chat" mode="creaturesAlways" />
        {:else}
          <span class="photograph" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg>
          </span>
        {/if}
      </span>
      <figcaption>
        <strong>{t('onboarding.faces.picturedName')}</strong>
        <span>{t('onboarding.faces.withPicture')}</span>
      </figcaption>
    </figure>
    <figure>
      <span class="avatar">
        <Avatar name={t('onboarding.faces.unpicturedName')} seed="@tim:iskra.chat" mode={preferences.faces} />
      </span>
      <figcaption>
        <strong>{t('onboarding.faces.unpicturedName')}</strong>
        <span>{t('onboarding.faces.withoutPicture')}</span>
      </figcaption>
    </figure>
  </div>

  <input
    type="range"
    min="0"
    max={stops.length - 1}
    step="1"
    value={position}
    aria-label={t('onboarding.faces.title')}
    aria-valuetext={t(label(current.key))}
    oninput={(event) => (preferences.faces = stops[Number(event.currentTarget.value)]!.mode)}
  />
  <div class="stops" aria-hidden="true">
    {#each stops as stop, i (stop.key)}
      <span class:chosen={i === position}>{t(label(stop.key))}</span>
    {/each}
  </div>
  <p class="help" aria-live="polite">{t(help(current.key))}</p>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  .faces {
    display: flex;
    justify-content: center;
    gap: var(--space-generous);
    margin-block-end: var(--space-normal);
  }
  figure {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: var(--space-close);
    margin: 0;
  }
  .avatar {
    --avatar-size: var(--size-avatar-profile);
    display: grid;
  }
  .photograph {
    display: grid;
    place-items: center;
    width: var(--size-avatar-profile);
    height: var(--size-avatar-profile);
    border-radius: var(--radius-circle);
    background: linear-gradient(135deg, var(--color-photo-from), var(--color-photo-to));
    color: white;
  }
  .photograph svg {
    width: 55%;
    height: 55%;
    fill: currentColor;
    translate: 0 var(--space-tight);
  }
  figcaption {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  figcaption span {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  input {
    width: 100%;
    accent-color: var(--accent);
  }
  .stops {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .stops span {
    flex: 1;
    text-align: center;
  }
  .stops span:first-child {
    text-align: start;
  }
  .stops span:last-child {
    text-align: end;
  }
  .stops .chosen {
    color: var(--color-text);
  }
  .help {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
    text-align: center;
  }
</style>
