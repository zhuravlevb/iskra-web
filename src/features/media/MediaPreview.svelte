<!--
  Фото, видео, «кружочек», стикер — в ленте. Место под картинку отведено до загрузки
  по размерам из события (`info.w/h`): лента не прыгает, когда картинка приходит.
  Нажатие — просмотрщик (стикер не открывается: смотреть в нём нечего).
-->
<script lang="ts">
  import type { MediaLoader } from '../../core/media/media';
  import type { Attachment } from '../../core/timeline/message';
  import { t } from '../../i18n/index.svelte.ts';
  import { aspect, ratio } from './files';
  import { untrack } from 'svelte';

  interface Props {
    kind: 'image' | 'sticker' | 'video' | 'videoNote';
    attachment: Attachment;
    media: MediaLoader;
    onopen?: () => void;
  }
  let { kind, attachment, media, onopen }: Props = $props();

  let url = $state<string | undefined>();
  let failed = $state(false);

  const round = $derived(kind === 'videoNote');
  const shape = $derived(round ? 1 : ratio(attachment.width, attachment.height));
  const label = $derived(
    kind === 'video' ? t('message.media.video') : kind === 'videoNote' ? t('message.media.videoNote') : t('message.media.photo'),
  );
  const video = $derived(kind === 'video' || kind === 'videoNote');

  /**
   * Что показываем — по содержимому, а не по объекту: лента пересобирает сообщения на каждой
   * синхронизации, и новый объект того же вложения не должен сбрасывать картинку. Иначе
   * `<img>` на миг пропадает и появляется заново — мигает, а Firefox, у которого между
   * нажатием и отпусканием элемент ушёл из DOM, не присылает `click` вовсе.
   */
  const identity = $derived(`${attachment.thumbnail?.source.mxc ?? ''} ${attachment.source?.mxc ?? ''} ${attachment.mimetype ?? ''}`);

  $effect(() => {
    const key = identity;
    const target = untrack(() => attachment);
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    url = undefined;
    failed = false;
    void media.preview(target, 320 * dpr).then((loaded) => {
      if (identity !== key) return;
      url = loaded;
      // Видео без миниатюры — не сбой: у него просто нет картинки до просмотра.
      failed = !loaded && !(target.mimetype ?? '').startsWith('video/') && kind !== 'video' && kind !== 'videoNote';
    });
  });

  function duration(ms: number): string {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

{#snippet picture()}
  {#if url}
    <img src={url} alt={attachment.caption ?? attachment.name} draggable="false" />
  {:else if failed}
    <span class="failed">{t('message.media.failed')}</span>
  {/if}
  {#if video}
    <span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
    {#if attachment.duration}<span class="duration">{duration(attachment.duration)}</span>{/if}
  {/if}
{/snippet}

{#if kind === 'sticker'}
  <span class="media sticker" use:aspect={shape}>{@render picture()}</span>
{:else}
  <button type="button" class="media" class:round class:loading={!url && !failed} use:aspect={shape} aria-label={label} title={t('message.media.openFullScreen')} onclick={onopen}>
    {@render picture()}
  </button>
{/if}

<style>
  .media {
    position: relative;
    display: block;
    /* Ширина — определённая, не в процентах: иначе пузырь, подстраиваясь под содержимое,
       раздувается до своего потолка. Узкий экран — `max-width`. */
    width: min(var(--size-media-max-width), calc(var(--size-media-max-height) * var(--ratio, 1)));
    max-width: 100%;
    aspect-ratio: var(--ratio, 1);
    padding: 0;
    border: none;
    border-radius: var(--radius-picture);
    background: var(--color-incoming-bubble);
    overflow: hidden;
    cursor: zoom-in;
  }
  .sticker {
    width: var(--size-sticker);
    background: transparent;
    cursor: default;
  }
  .round {
    width: var(--size-video-note);
    border-radius: var(--radius-circle);
  }
  .loading {
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.6;
    }
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .sticker img {
    object-fit: contain;
  }
  .failed {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-close);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .play {
    position: absolute;
    inset: 50% auto auto 50%;
    translate: -50% -50%;
    display: grid;
    place-items: center;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border-radius: var(--radius-circle);
    background: rgb(0 0 0 / 0.5);
    color: white;
  }
  .play svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .duration {
    position: absolute;
    inset: auto auto var(--space-close) var(--space-close);
    padding: var(--space-within-run) var(--space-close);
    border-radius: var(--radius-circle);
    background: rgb(0 0 0 / 0.5);
    color: white;
    font-size: var(--font-size-caption);
  }
</style>
