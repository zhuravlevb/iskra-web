<!--
  Опрос в пузыре. Ответы — кнопки: один ответ — как радиокнопки, несколько — как галочки.
  Итоги видны, когда ты проголосовал или опрос закончен; в скрытом опросе — только после
  конца. Нажать на свой ответ ещё раз — отозвать голос.
-->
<script lang="ts">
  import type { Poll } from '../../core/timeline/message';
  import { plural, t } from '../../i18n/index.svelte.ts';

  interface Props {
    poll: Poll;
    /** Нет ID (ещё не ушёл) — голосовать не во что. */
    canVote: boolean;
    onvote: (answerIds: string[]) => void;
  }
  let { poll, canVote, onvote }: Props = $props();

  const voted = $derived(poll.mine.length > 0);
  const showResults = $derived(poll.ended || (voted && !poll.undisclosed));
  const single = $derived(poll.maxSelections === 1);
  const leader = $derived(Math.max(0, ...poll.answers.map((a) => a.votes)));

  function choose(id: string) {
    if (single) {
      onvote(poll.mine.includes(id) ? [] : [id]);
      return;
    }
    const next = poll.mine.includes(id) ? poll.mine.filter((a) => a !== id) : [...poll.mine, id];
    if (next.length <= poll.maxSelections) onvote(next);
  }

  const share = (votes: number) => (poll.voters ? Math.round((votes / poll.voters) * 100) : 0);

  /** Доля — шириной полосы. Через CSSOM: атрибут `style` строгая CSP не пустит. */
  function width(node: HTMLElement, percent: number) {
    const set = (value: number) => (node.style.width = `${value}%`);
    set(percent);
    return { update: set };
  }

  const footer = $derived(
    [
      poll.ended ? t('poll.ended') : poll.undisclosed && voted ? t('poll.resultsHidden') : '',
      poll.voters ? plural('poll.voters', poll.voters) : t('poll.noVotes'),
    ]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<div class="poll">
  <span class="label">{t('preview.poll')}</span>
  <strong class="question">{poll.question}</strong>
  {#if !single && !poll.ended}
    <span class="hint">{plural('poll.chooseUpTo', poll.maxSelections)}</span>
  {/if}
  <div class="answers" role={single ? 'radiogroup' : 'group'} aria-label={poll.question}>
    {#each poll.answers as answer (answer.id)}
      {@const chosen = poll.mine.includes(answer.id)}
      <button
        type="button"
        class="answer"
        class:chosen
        class:winner={poll.ended && answer.votes === leader && leader > 0}
        role={single ? 'radio' : 'checkbox'}
        aria-checked={chosen}
        disabled={!canVote || poll.ended}
        onclick={() => choose(answer.id)}
      >
        <span class="text">{answer.text}</span>
        {#if showResults}
          <span class="count">{plural('poll.votes', answer.votes)}</span>
          <span class="bar" aria-hidden="true"><span class="fill" use:width={share(answer.votes)}></span></span>
        {/if}
      </button>
    {/each}
  </div>
  <span class="footer">{footer}</span>
</div>

<style>
  .poll {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    min-width: min(var(--size-menu-width), 100%);
  }
  .label,
  .hint,
  .footer {
    font-size: var(--font-size-caption);
    opacity: 0.8;
  }
  .label {
    font-weight: 600;
  }
  .answers {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    margin-block: var(--space-tight);
  }
  .answer {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--space-tight) var(--space-close);
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: var(--border-hairline) solid currentColor;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .answer:disabled {
    cursor: default;
  }
  .answer.chosen {
    border-width: 2px;
    font-weight: 600;
  }
  .answer.winner .text {
    font-weight: 600;
  }
  .count {
    font-size: var(--font-size-caption);
    opacity: 0.8;
  }
  .bar {
    grid-column: 1 / -1;
    height: var(--space-tight);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    width: 0;
    background: currentColor;
    opacity: 0.6;
  }
</style>
