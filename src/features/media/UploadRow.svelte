<!--
  Вложение в пути — своим пузырём в конце ленты: превью с устройства, прогресс, «Отменить».
  Не ушло — «Не отправлено» и «Отправить заново», как у текста. Ушло — строка исчезает,
  её место занимает обычное сообщение.

  Превью — object URL самого файла с этого устройства; отзывается, как только строка ушла.
-->
<script lang="ts">
  import type { Upload } from '../../core/timeline/timelineStore.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { aspect, fileSize, ratio } from './files';

  interface Props {
    upload: Upload;
    onretry: () => void;
    oncancel: () => void;
  }
  let { upload, onretry, oncancel }: Props = $props();

  const file = $derived(upload.file);
  const visual = $derived(file.kind === 'image' || (file.kind === 'video' && !!file.thumbnail));
  let preview = $state<string | undefined>();

  $effect(() => {
    if (!visual) return;
    const source = file.kind === 'image' ? file.blob : file.thumbnail!.blob;
    const url = URL.createObjectURL(source);
    preview = url;
    return () => URL.revokeObjectURL(url);
  });

  const percent = $derived(Math.round(upload.progress * 100));
</script>

<div class="row">
  <div class="bubble" role="article" aria-busy={upload.state === 'uploading'}>
    {#if visual && preview}
      <span class="media" use:aspect={ratio(file.width, file.height)}><img src={preview} alt={file.name} /></span>
    {:else}
      <span class="file"><span class="name">{file.name}</span><span class="size">{fileSize(file.blob.size, i18n.locale)}</span></span>
    {/if}
    {#if upload.caption}<span class="caption">{upload.caption}</span>{/if}
    {#if upload.state === 'uploading'}
      <span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} aria-label={t('upload.progress', { percent })}>
        <span class="bar" use:aspect={upload.progress}></span>
      </span>
      <span class="status">
        {t('upload.progress', { percent })}
        <button type="button" onclick={oncancel}>{t('upload.cancel')}</button>
      </span>
    {/if}
  </div>
  {#if upload.state === 'failed'}
    <div class="failure" role="alert">
      <strong>{t('message.delivery.failed')}</strong>
      <span class="actions">
        <button type="button" onclick={oncancel}>{t('message.delivery.discard')}</button>
        <button type="button" class="again" onclick={onretry}>{t('message.delivery.sendAgain')}</button>
      </span>
    </div>
  {/if}
</div>

<style>
  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-tight);
    margin-block-start: var(--space-between-senders);
  }
  .bubble {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    width: min-content;
    min-width: min(var(--size-menu-width), var(--bubble-width-fraction));
    max-width: var(--bubble-width-fraction);
    padding: var(--space-tight);
    border-radius: var(--radius-bubble);
    background: var(--bubble-own);
    color: var(--on-bubble-own);
  }
  .media {
    display: block;
    width: min(var(--size-media-max-width), calc(var(--size-media-max-height) * var(--ratio, 1)));
    max-width: 100%;
    aspect-ratio: var(--ratio, 1);
    border-radius: var(--radius-picture);
    overflow: hidden;
    opacity: 0.7;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .file {
    display: flex;
    flex-direction: column;
    padding: var(--space-close) var(--space-normal);
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .size,
  .status {
    font-size: var(--font-size-caption);
    opacity: 0.8;
  }
  .caption {
    padding: 0 var(--space-close);
    white-space: pre-wrap;
  }
  .progress {
    display: block;
    height: var(--space-tight);
    margin: 0 var(--space-close);
    border-radius: var(--radius-circle);
    background: rgb(0 0 0 / 0.15);
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    width: calc(var(--ratio, 0) * 100%);
    background: currentColor;
    transition: width var(--timing-chrome);
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-close);
    padding: 0 var(--space-close);
  }
  .status button,
  .actions button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .failure {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: var(--font-size-caption);
    color: var(--color-danger);
  }
  .actions {
    display: flex;
    gap: var(--space-close);
  }
  .actions button {
    background: var(--color-incoming-bubble);
    color: var(--color-text);
  }
  .actions .again {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
