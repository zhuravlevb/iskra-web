<!--
  Файл или звук в ленте: имя, размер, «Сохранить». Звук — «Слушать»: байты скачиваются
  (и расшифровываются) по нажатию, а не заранее — голосовые и музыку не качают, пока не
  попросили. Голосовые как у нативной Искры — этап 10.
-->
<script lang="ts">
  import { MediaError, type MediaLoader } from '../../core/media/media';
  import type { Attachment } from '../../core/timeline/message';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { fileSize, saveBlob } from './files';

  interface Props {
    kind: 'file' | 'audio' | 'voice';
    attachment: Attachment;
    media: MediaLoader;
  }
  let { kind, attachment, media }: Props = $props();

  let busy = $state(false);
  let problem = $state<'failed' | 'tampered' | null>(null);
  let audioUrl = $state<string | undefined>();

  $effect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });

  async function fetchBlob(): Promise<Blob | undefined> {
    if (!attachment.source) return undefined;
    busy = true;
    problem = null;
    try {
      return await media.blob(attachment.source, attachment.mimetype);
    } catch (error) {
      problem = error instanceof MediaError && error.reason === 'tampered' ? 'tampered' : 'failed';
      return undefined;
    } finally {
      busy = false;
    }
  }

  async function save() {
    const blob = await fetchBlob();
    if (blob) saveBlob(blob, attachment.name);
  }

  async function listen() {
    const blob = await fetchBlob();
    if (blob) audioUrl = URL.createObjectURL(blob);
  }
</script>

<div class="file">
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    {#if kind === 'file'}<path d="M6 3h8l4 4v14H6zM14 3v4h4" />{:else}<path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" />{/if}
  </svg>
  <span class="what">
    <span class="name">{attachment.name}</span>
    {#if attachment.size !== undefined}<span class="size">{fileSize(attachment.size, i18n.locale)}</span>{/if}
  </span>
  {#if kind !== 'file' && !audioUrl}
    <button type="button" disabled={busy || !attachment.source} onclick={listen}>{t('message.media.play')}</button>
  {/if}
  <button type="button" disabled={busy || !attachment.source} onclick={save}>{t('message.media.save')}</button>
</div>
{#if audioUrl}
  <audio controls autoplay src={audioUrl}></audio>
{/if}
{#if problem}
  <span class="problem" role="alert">{problem === 'tampered' ? t('message.media.tampered') : t('message.media.failed')}</span>
{/if}

<style>
  .file {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    min-width: min(var(--size-menu-width), 100%);
  }
  .icon {
    flex: none;
    width: var(--size-avatar-small);
    height: var(--size-avatar-small);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
    opacity: 0.8;
  }
  .what {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .size {
    font-size: var(--font-size-caption);
    opacity: 0.8;
  }
  button {
    flex: none;
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: var(--border-hairline) solid currentColor;
    border-radius: var(--radius-circle);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--font-size-caption);
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  audio {
    display: block;
    width: 100%;
    margin-block-start: var(--space-close);
  }
  .problem {
    display: block;
    margin-block-start: var(--space-tight);
    font-size: var(--font-size-caption);
    color: var(--color-danger);
  }
</style>
