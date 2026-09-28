<!--
  Что пошло не так — сказано так, чтобы это увидели. Урок нативной Искры: серая строчка
  под полем была самым тихим на экране, и люди вводили неверный пароль снова и снова.
  Красная, на своей панели, и объявляется скринридеру (`role="alert"`), а не просто есть.
-->
<script lang="ts">
  let { title, message }: { title?: string; message: string } = $props();
</script>

<div class="problem" role="alert">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3zm0 6v6m0 3v.01" /></svg>
  <div>
    {#if title}<strong>{title}</strong>{/if}
    <p>{message}</p>
  </div>
</div>

<style>
  .problem {
    display: flex;
    gap: var(--space-close);
    align-items: flex-start;
    padding: var(--space-normal);
    border-radius: var(--radius-bubble);
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
    font-weight: 500;
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  strong {
    display: block;
    margin-block-end: var(--space-tight);
  }
  p {
    margin: 0;
  }
</style>
