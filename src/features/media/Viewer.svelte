<!--
  Просмотрщик фото и видео комнаты (см. план, «Медиа»).

  Телефон: щипок — приближение вокруг пальцев, двойное касание — в точку и обратно,
  свайп вниз закрывает и гасит фон, свайп вбок листает.
  Десктоп: `←`/`→` листают, `Esc` закрывает, `Ctrl` + колесо и щипок на трекпаде (это тот
  же `wheel` с `ctrlKey`) приближают к курсору, перетаскивание двигает, `+`/`-`/`0` — масштаб.

  Оригинал скачивается (и расшифровывается) здесь и живёт ровно пока открыт: листнули или
  закрыли — `revokeObjectURL`. Пока он в пути — видна миниатюра из кэша ленты.
-->
<script lang="ts" module>
  import type { Attachment } from '../../core/timeline/message';

  export interface ViewerItem {
    key: string;
    kind: 'image' | 'video' | 'videoNote';
    attachment: Attachment;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { MediaError, type MediaLoader } from '../../core/media/media';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { saveBlob } from './files';
  import { clampPan, identity, STEP, zoomAt, type View } from './zoom';

  interface Props {
    items: ViewerItem[];
    start: string;
    media: MediaLoader;
    onclose: () => void;
  }
  let { items, start, media, onclose }: Props = $props();

  /** Сколько пикселей пальцем — уже жест, а не касание. */
  const SLOP = 10;
  const DISMISS = 120;
  const SWIPE = 60;
  const DOUBLE_TAP_MS = 300;
  const DOUBLE_TAP_SCALE = 2.5;

  let dialog: HTMLDialogElement | undefined = $state();
  let stage: HTMLDivElement | undefined = $state();
  let frame: HTMLDivElement | undefined = $state();
  let picture: HTMLImageElement | undefined = $state();

  // svelte-ignore state_referenced_locally
  let index = $state(Math.max(0, items.findIndex((i) => i.key === start)));
  const item = $derived(items[index]);
  const isVideo = $derived(item?.kind !== 'image');

  let preview = $state<string | undefined>();
  let full = $state<string | undefined>();
  let blob: Blob | undefined;
  let problem = $state<'failed' | 'tampered' | null>(null);
  let copied = $state(false);

  let view = $state<View>(identity);
  /** Сдвиг жестом при масштабе 1: вниз — закрыть, вбок — листать. */
  let drag = $state({ x: 0, y: 0 });

  onMount(() => {
    dialog?.showModal();
  });

  // Текущее: миниатюра сразу, оригинал — следом; листнули — прежний оригинал отозван.
  $effect(() => {
    const current = item;
    if (!current) return;
    let alive = true;
    let created: string | undefined;
    preview = undefined;
    full = undefined;
    blob = undefined;
    problem = null;
    view = identity;
    void media.preview(current.attachment, 1024).then((url) => alive && (preview = url));
    if (current.attachment.source) {
      media
        .blob(current.attachment.source, current.attachment.mimetype)
        .then((loaded) => {
          if (!alive) return;
          blob = loaded;
          created = URL.createObjectURL(loaded);
          full = created;
        })
        .catch((error: unknown) => {
          if (alive) problem = error instanceof MediaError && error.reason === 'tampered' ? 'tampered' : 'failed';
        });
    } else {
      problem = 'failed';
    }
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  });

  // Трансформация — через CSSOM: атрибут `style` строгая CSP не пустит.
  $effect(() => {
    if (frame) frame.style.transform = `translate(${view.x + drag.x}px, ${view.y + drag.y}px) scale(${view.scale})`;
    if (dialog) dialog.style.setProperty('--dim', String(Math.max(0.2, 1 - Math.abs(drag.y) / (DISMISS * 3))));
  });

  function go(step: -1 | 1) {
    const next = index + step;
    if (next >= 0 && next < items.length) index = next;
  }

  /** Точка события — от центра сцены. */
  function fromCenter(clientX: number, clientY: number) {
    const rect = stage!.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  function clamped(next: View): View {
    if (!frame || !stage) return next;
    return clampPan(next, { width: frame.offsetWidth, height: frame.offsetHeight }, { width: stage.clientWidth, height: stage.clientHeight });
  }

  function zoomTo(scale: number, at = { x: 0, y: 0 }) {
    view = clamped(zoomAt(view, scale, at.x, at.y));
  }

  // ————— Клавиатура —————

  function onkeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowLeft':
        go(-1);
        break;
      case 'ArrowRight':
        go(1);
        break;
      case '+':
      case '=':
        zoomTo(view.scale * STEP);
        break;
      case '-':
        zoomTo(view.scale / STEP);
        break;
      case '0':
        view = identity;
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ————— Колесо и трекпад —————

  function onwheel(event: WheelEvent) {
    if (isVideo) return;
    event.preventDefault();
    if (event.ctrlKey) {
      // Щипок трекпада приходит сюда же — с `ctrlKey` и мелкими шагами.
      zoomTo(view.scale * Math.exp(-event.deltaY * 0.01), fromCenter(event.clientX, event.clientY));
    } else if (view.scale > 1) {
      view = clamped({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY });
    }
  }

  // ————— Указатель: мышь и пальцы —————

  // Где сейчас пальцы — рабочая память жеста, не состояние экрана.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture:
    | { type: 'pan'; from: { x: number; y: number }; view: View }
    | { type: 'pinch'; distance: number; mid: { x: number; y: number }; view: View }
    | { type: 'undecided' | 'dismiss' | 'swipe'; from: { x: number; y: number } }
    | null = null;
  let lastTap = 0;
  /** Идёт жест — без сглаживания: картинка должна идти за пальцем, а не догонять его. */
  let gesturing = $state(false);

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function onpointerdown(event: PointerEvent) {
    if (isVideo || (event.pointerType === 'mouse' && event.button !== 0)) return;
    try {
      stage?.setPointerCapture(event.pointerId);
    } catch {
      // Указатель уже ушёл (или его и не было) — жест всё равно наш, просто без захвата.
    }
    gesturing = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (points.length === 2) {
      drag = { x: 0, y: 0 };
      gesture = { type: 'pinch', distance: distance(points[0]!, points[1]!), mid: midpoint(points[0]!, points[1]!), view };
    } else if (points.length === 1) {
      const from = { x: event.clientX, y: event.clientY };
      gesture = view.scale > 1 ? { type: 'pan', from, view } : { type: 'undecided', from };
    }
  }

  function onpointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (gesture.type === 'pinch' && points.length === 2) {
      const mid = midpoint(points[0]!, points[1]!);
      const at = fromCenter(gesture.mid.x, gesture.mid.y);
      const zoomed = zoomAt(gesture.view, gesture.view.scale * (distance(points[0]!, points[1]!) / gesture.distance), at.x, at.y);
      view = clamped({ ...zoomed, x: zoomed.x + mid.x - gesture.mid.x, y: zoomed.y + mid.y - gesture.mid.y });
      return;
    }
    if (gesture.type === 'pinch') return;
    const dx = event.clientX - gesture.from.x;
    const dy = event.clientY - gesture.from.y;
    if (gesture.type === 'pan') {
      view = clamped({ ...gesture.view, x: gesture.view.x + dx, y: gesture.view.y + dy });
      return;
    }
    if (gesture.type === 'undecided' && Math.hypot(dx, dy) > SLOP) {
      gesture = { type: Math.abs(dy) > Math.abs(dx) ? 'dismiss' : 'swipe', from: gesture.from };
    }
    if (gesture.type === 'dismiss') drag = { x: 0, y: dy };
    else if (gesture.type === 'swipe') drag = { x: dx, y: 0 };
  }

  function onpointerup(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    const ended = gesture;
    if (pointers.size === 1 && ended?.type === 'pinch') {
      // Отпустили один палец из двух — дальше второй двигает.
      const [rest] = pointers.values();
      gesture = { type: 'pan', from: rest!, view };
      return;
    }
    if (pointers.size > 0) return;
    gesture = null;
    gesturing = false;
    if (ended?.type === 'dismiss' && Math.abs(drag.y) > DISMISS) {
      close();
      return;
    }
    if (ended?.type === 'swipe' && Math.abs(drag.x) > SWIPE) go(drag.x < 0 ? 1 : -1);
    const tapped = ended?.type === 'undecided';
    drag = { x: 0, y: 0 };
    if (tapped && event.pointerType === 'touch') {
      // Двойное касание — к точке и обратно. Мышь пользуется двойным щелчком.
      if (event.timeStamp - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        toggleZoom(event.clientX, event.clientY);
      } else {
        lastTap = event.timeStamp;
      }
    }
  }

  function toggleZoom(clientX: number, clientY: number) {
    if (view.scale > 1) view = identity;
    else zoomTo(DOUBLE_TAP_SCALE, fromCenter(clientX, clientY));
  }

  // ————— Действия —————

  function close() {
    dialog?.close();
  }

  function save() {
    if (blob && item) saveBlob(blob, item.attachment.name);
  }

  const canShare = $derived(
    !viewport.finePointer && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function',
  );

  async function share() {
    if (!blob || !item) return;
    const file = new File([blob], item.attachment.name || 'image', { type: blob.type });
    if (!navigator.canShare?.({ files: [file] })) return;
    await navigator.share({ files: [file] }).catch(() => {});
  }

  /** «Скопировать» — на десктопе; в буфер кладётся PNG: его понимают все, кто вставляет. */
  async function copy() {
    if (!picture || !full) return;
    try {
      const png = await new Promise<Blob | null>((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = picture!.naturalWidth;
        canvas.height = picture!.naturalHeight;
        canvas.getContext('2d')?.drawImage(picture!, 0, 0);
        canvas.toBlob(resolve, 'image/png');
      });
      if (!png) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Буфер не дали — ничего страшного: есть «Сохранить».
    }
  }

  const label = $derived(
    item?.kind === 'video' ? t('message.media.video') : item?.kind === 'videoNote' ? t('message.media.videoNote') : t('message.media.photo'),
  );
</script>

<dialog bind:this={dialog} class="viewer" aria-label={label} {onclose} {onkeydown}>
  <div class="bar">
    <button type="button" aria-label={t('message.media.close')} title={t('message.media.close')} onclick={close}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
    <span class="position" role="status">{items.length > 1 ? t('message.media.position', { index: index + 1, count: items.length }) : ''}</span>
    {#if !isVideo && viewport.finePointer}
      <button type="button" aria-label={t('message.media.zoomOut')} title={t('message.media.zoomOut')} onclick={() => zoomTo(view.scale / STEP)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <button type="button" aria-label={t('message.media.zoomIn')} title={t('message.media.zoomIn')} onclick={() => zoomTo(view.scale * STEP)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <button type="button" disabled={!full} onclick={copy}>{copied ? t('message.media.copied') : t('message.media.copy')}</button>
    {/if}
    {#if canShare}
      <button type="button" disabled={!full} onclick={share}>{t('message.media.share')}</button>
    {/if}
    <button type="button" disabled={!full} onclick={save}>{t('message.media.save')}</button>
  </div>

  <div
    class="stage"
    class:zoomed={view.scale > 1}
    bind:this={stage}
    role="presentation"
    {onwheel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    ondblclick={(event) => !isVideo && toggleZoom(event.clientX, event.clientY)}
  >
    {#if item}
      <div class="frame" class:settling={!gesturing} bind:this={frame}>
        {#if problem}
          <p class="problem" role="alert">{problem === 'tampered' ? t('message.media.tampered') : isVideo ? t('message.media.loadFailed') : t('message.media.failed')}</p>
        {:else if isVideo && full}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={full} controls autoplay playsinline class:round={item.kind === 'videoNote'}></video>
        {:else if full || preview}
          <img bind:this={picture} src={full ?? preview} alt={item.attachment.caption ?? item.attachment.name} draggable="false" />
        {/if}
      </div>
    {/if}
  </div>

  {#if items.length > 1 && viewport.finePointer}
    <button type="button" class="side previous" disabled={index === 0} aria-label={t('message.media.previous')} title={t('message.media.previous')} onclick={() => go(-1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <button type="button" class="side next" disabled={index === items.length - 1} aria-label={t('message.media.next')} title={t('message.media.next')} onclick={() => go(1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  {/if}

  {#if item?.attachment.caption}
    <p class="caption">{item.attachment.caption}</p>
  {/if}
</dialog>

<style>
  .viewer {
    --dim: 1;
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: 0;
    border: none;
    background: rgb(0 0 0 / calc(0.92 * var(--dim)));
    color: white;
    overflow: hidden;
  }
  .viewer::backdrop {
    background: transparent;
  }
  .bar {
    position: absolute;
    z-index: 2;
    inset: 0 0 auto 0;
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    padding: max(var(--space-close), env(safe-area-inset-top)) var(--space-close) var(--space-close);
    background: linear-gradient(rgb(0 0 0 / 0.5), transparent);
    opacity: var(--dim);
  }
  .position {
    flex: 1;
    font-size: var(--font-size-caption);
    opacity: 0.8;
  }
  button {
    display: grid;
    place-items: center;
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    padding: 0 var(--space-close);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  @media (hover: hover) {
    button:not(:disabled):hover {
      background: rgb(255 255 255 / 0.12);
    }
  }
  svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    /* Жесты — наши: ни прокрутки, ни масштаба страницы поверх. */
    touch-action: none;
    cursor: zoom-in;
  }
  .stage.zoomed {
    cursor: grab;
  }
  .stage.zoomed:active {
    cursor: grabbing;
  }
  .frame {
    display: grid;
    place-items: center;
    max-width: 100%;
    max-height: 100%;
    transform-origin: center;
    will-change: transform;
  }
  .frame.settling {
    transition: transform var(--timing-chrome) ease-out;
  }
  img,
  video {
    display: block;
    max-width: 100vw;
    max-height: 100vh;
    max-height: 100dvh;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  video.round {
    max-width: min(100vw, 30rem);
    border-radius: var(--radius-circle);
  }
  .problem {
    max-width: var(--size-sign-in-column);
    padding: var(--space-roomy);
    text-align: center;
  }
  .side {
    position: absolute;
    z-index: 2;
    inset-block-start: 50%;
    translate: 0 -50%;
    width: var(--tap-target);
    height: var(--tap-target);
    background: rgb(0 0 0 / 0.4);
  }
  .previous {
    inset-inline-start: var(--space-roomy);
  }
  .next {
    inset-inline-end: var(--space-roomy);
  }
  .caption {
    position: absolute;
    z-index: 2;
    inset: auto 0 0 0;
    margin: 0;
    padding: var(--space-roomy) var(--space-roomy) max(var(--space-roomy), env(safe-area-inset-bottom));
    background: linear-gradient(transparent, rgb(0 0 0 / 0.6));
    text-align: center;
    white-space: pre-wrap;
    opacity: var(--dim);
  }
</style>
