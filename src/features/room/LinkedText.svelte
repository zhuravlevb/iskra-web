<!-- Текст сообщения со ссылками. Куски, а не HTML: ни одна строчка не идёт в `innerHTML`. -->
<script lang="ts">
  import { linkify } from '../../design/linkify';
  let { text }: { text: string } = $props();
  const segments = $derived(linkify(text));
</script>

{#each segments as segment, i (i)}{#if segment.href}<a href={segment.href} target="_blank" rel="noopener noreferrer">{segment.text}</a>{:else}{segment.text}{/if}{/each}

<style>
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
</style>
