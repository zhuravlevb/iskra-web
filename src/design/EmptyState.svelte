<!-- Пустое место с заголовком и пояснением: «Чатов пока нет», «Выберите чат». -->
<script lang="ts">
  interface Props {
    title: string;
    message?: string;
  }
  let { title, message }: Props = $props();
</script>

<div class="empty">
  <h2>{title}</h2>
  {#if message}<p>{message}</p>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-close);
    height: 100%;
    padding: var(--space-generous);
    text-align: center;
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
    font-weight: 600;
  }
  p {
    margin: 0;
    max-width: 20rem;
    color: var(--color-text-secondary);
  }
</style>
