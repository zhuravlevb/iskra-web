<!--
  Значок непрочитанного — как в нативной Искре (ветка dev):

  - число — в акценте, у беззвучного чата — серое. Серый — это не отсутствие цвета, а
    сказанное: «да, тут что-то есть, и вы просили не беспокоить»;
  - нечего считать (беззвучный, отмечен вручную) — точка, а не «0»;
  - упоминание — отдельная «@» рядом, всегда в акценте: Matrix пропускает упоминание и
    сквозь беззвучие. Не красный значок: красный в списке чатов читается как ошибка.

  Для скринридера значок молчит: строка читается одной фразой (см. `RoomRow`).
-->
<script lang="ts">
  interface Props {
    count: number;
    mentioned: boolean;
    muted: boolean;
    /** Число в форме языка: «1 234», а не «1234». */
    format: (n: number) => string;
  }
  let { count, mentioned, muted, format }: Props = $props();
</script>

<span class="badges" aria-hidden="true">
  {#if mentioned}
    <span class="mention">@</span>
  {/if}
  {#if count > 0}
    <span class="count" class:muted>{format(count)}</span>
  {:else if !mentioned}
    <span class="dot" class:muted></span>
  {/if}
</span>

<style>
  .badges {
    display: inline-flex;
    align-items: center;
    gap: var(--space-tight);
    flex: none;
  }
  .mention,
  .count {
    display: inline-grid;
    place-items: center;
    min-width: var(--size-unread-badge);
    height: var(--size-unread-badge);
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--font-size-caption);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .count {
    padding: 0 var(--space-close);
  }
  .dot {
    width: var(--size-recording-dot);
    height: var(--size-recording-dot);
    border-radius: var(--radius-circle);
    background: var(--accent);
  }
  .count.muted,
  .dot.muted {
    background: var(--color-muted-badge);
    color: var(--color-on-muted-badge);
  }
</style>
