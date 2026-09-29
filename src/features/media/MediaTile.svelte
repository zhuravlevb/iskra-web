<!--
  Клетка сетки «Фото и видео» в «О чате»: квадрат, и картинка в нём — пассажир, а не хозяин.
  Панорама не раздувает свою клетку: квадрат задаёт `aspect-ratio`, картинка обрезается
  по нему (`object-fit: cover`). «Кружочек» — круглый. Нажатие — просмотрщик.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { MediaLoader } from '../../core/media/media';
  import type { Attachment } from '../../core/timeline/message';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    kind: 'image' | 'video' | 'videoNote';
    attachment: Attachment;
    media: MediaLoader;
    onopen: () => void;
  }
  let { kind, attachment, media, onopen }: Props = $props();

  let url = $state<string | undefined>();
  const video = $derived(kind !== 'image');
  const label = $derived(kind === 'video' ? t('message.media.video') : kind === 'videoNote' ? t('message.media.videoNote') : t('message.media.photo'));
  // По содержимому, а не по объекту — как в ленте: новый объект того же вложения не мигает.
  const identity = $derived(`${attachment.thumbnail?.source.mxc ?? ''} ${attachment.source?.mxc ?? ''}`);

  $effect(() => {
    const key = identity;
    const target = untrack(() => attachment);
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    url = undefined;
    void media.preview(target, 160 * dpr).then((loaded) => {
      if (identity === key) url = loaded;
    });
  });
</script>

<button type="button" class="tile" class:round={kind === 'videoNote'} aria-label={label} title={t('message.media.openFullScreen')} onclick={onopen}>
  {#if url}<img src={url} alt={attachment.caption ?? attachment.name} draggable="false" />{/if}
  {#if video}
    <span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
  {/if}
</button>

<style>
  .tile {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: none;
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
    overflow: hidden;
    cursor: zoom-in;
  }
  .round {
    border-radius: var(--radius-circle);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .play {
    position: absolute;
    inset: auto var(--space-tight) var(--space-tight) auto;
    display: grid;
    place-items: center;
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    border-radius: var(--radius-circle);
    background: rgb(0 0 0 / 0.5);
    color: white;
  }
  .round .play {
    inset: 50% auto auto 50%;
    translate: -50% -50%;
  }
  .play svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
</style>
