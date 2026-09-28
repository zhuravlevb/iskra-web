<!--
  Вложения, выбранные к отправке, — над полем композера: превью с этого устройства и
  «Убрать из сообщения». Ничего не уходит, пока не нажали «Отправить»: вставка из буфера и
  перетаскивание — «с превью и подписью перед отправкой, никогда не сразу» (план).
-->
<script lang="ts">
  import type { OutgoingFile } from '../../core/media/upload';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { fileSize } from './files';

  let { files, onremove }: { files: OutgoingFile[]; onremove: (index: number) => void } = $props();

  // Object URL превью — на время, пока вложение в лотке.
  let previews = $state<(string | undefined)[]>([]);
  $effect(() => {
    const urls = files.map((f) => (f.kind === 'image' ? URL.createObjectURL(f.blob) : f.thumbnail ? URL.createObjectURL(f.thumbnail.blob) : undefined));
    previews = urls;
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  });
</script>

<ul class="tray">
  {#each files as file, index (file)}
    <li class="tile" class:visual={!!previews[index]}>
      {#if previews[index]}
        <img src={previews[index]} alt={file.kind === 'video' ? t('room.attachedVideo') : t('room.attachedPhoto')} />
      {:else}
        <span class="file">
          <span class="name">{file.name}</span>
          <span class="size">{fileSize(file.blob.size, i18n.locale)}</span>
        </span>
      {/if}
      <button type="button" aria-label={`${t('room.removeAttachment')}: ${file.name}`} title={t('room.removeAttachment')} onclick={() => onremove(index)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </li>
  {/each}
</ul>

<style>
  .tray {
    display: flex;
    gap: var(--space-close);
    max-width: var(--column-timeline-max);
    margin: 0 auto var(--space-close);
    padding: 0;
    list-style: none;
    overflow-x: auto;
  }
  .tile {
    position: relative;
    flex: none;
    height: var(--size-attachment-tile);
    min-width: var(--size-attachment-tile);
    max-width: calc(3 * var(--size-attachment-tile));
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
    overflow: hidden;
  }
  .visual {
    width: var(--size-attachment-tile);
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
    justify-content: center;
    height: 100%;
    padding: var(--space-close) var(--space-generous) var(--space-close) var(--space-close);
    font-size: var(--font-size-caption);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .size {
    color: var(--color-text-secondary);
  }
  button {
    position: absolute;
    inset: var(--space-tight) var(--space-tight) auto auto;
    display: grid;
    place-items: center;
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    padding: 0;
    border: none;
    border-radius: var(--radius-circle);
    background: rgb(0 0 0 / 0.55);
    color: white;
    cursor: pointer;
  }
  svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
</style>
