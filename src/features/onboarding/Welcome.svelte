<!--
  Что такое Iskra — до первого входа на этом устройстве (`WelcomeView` нативной Искры).

  Слайды идут сами и листаются — пальцем, стрелками, колесом у точек нет: точки — указатель
  места, а не кнопки. Часы перезапускаются любым перелистыванием, иначе слайд уезжает из-под
  читающего; и **останавливаются на последнем**: сказано всё, а пролистанная по кругу
  реклама — это приложение, не заметившее, что вы ещё здесь.

  Кнопка одна, и это вход. «Пропустить» нет: слайды — не шаг, который надо пройти, а
  единственное, что на экране, и кнопка под ними есть на каждом.

  Слайда «Apple way» здесь нет: он о нативном приложении на Swift, а это — не оно.
-->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import { asset } from '../../design/asset';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { ARRIVAL_MS, motion, WELCOME_SLIDE_MS } from './timing';

  let { onstart }: { onstart: () => void } = $props();

  const slides = ['iskra', 'encryption', 'decentralised', 'freedom', 'anonymous'] as const;
  const title = (slide: string): TextKey => `onboarding.slide.${slide}.title` as TextKey;
  const body = (slide: string): TextKey => `onboarding.slide.${slide}.body` as TextKey;

  let index = $state(0);
  let forward = $state(true);

  // Часы — от смены слайда, в том числе рукой; на последнем — стоят.
  $effect(() => {
    if (index >= slides.length - 1) return;
    const timer = setTimeout(() => move(1), WELCOME_SLIDE_MS);
    return () => clearTimeout(timer);
  });

  /** На слайд вперёд или назад — и никуда за края: карусель не закольцована. */
  function move(step: number) {
    const next = index + step;
    if (next < 0 || next >= slides.length) return;
    forward = step > 0;
    index = next;
  }

  // Свайп — по всему экрану, а не по карточке: на коротком слайде карточка — маленькая цель.
  let startX: number | null = null;
  function onpointerdown(event: PointerEvent) {
    if (event.pointerType !== 'mouse') startX = event.clientX;
  }
  function onpointerup(event: PointerEvent) {
    if (startX === null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 48) move(dx < 0 ? 1 : -1);
  }
  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'ArrowLeft') move(-1);
  }

  const offset = $derived(forward ? 48 : -48);
</script>

<svelte:window {onkeydown} />

<main class="welcome" {onpointerdown} {onpointerup} onpointercancel={() => (startX = null)}>
  <div class="stage">
    <img class="mark" src={asset('icons/icon.svg')} alt="" />
    {#key index}
      <div class="slide" aria-live="polite" in:fly={{ x: offset, duration: motion(ARRIVAL_MS) }}>
        <h1>{t(title(slides[index]!))}</h1>
        <p>{t(body(slides[index]!))}</p>
      </div>
    {/key}
  </div>
  <div
    class="dots"
    role="img"
    aria-label={t('onboarding.slidePosition', { index: String(index + 1), count: String(slides.length) })}
  >
    {#each slides as slide, position (slide)}
      <span class="dot" class:current={position === index}></span>
    {/each}
  </div>
  <PrimaryButton wide onclick={onstart}>{t('onboarding.start')}</PrimaryButton>
</main>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-generous);
    width: 100%;
    max-width: var(--size-sign-in-column);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-generous);
    padding-block: max(var(--space-generous), env(safe-area-inset-top)) max(var(--space-generous), env(safe-area-inset-bottom));
    touch-action: pan-y;
  }
  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-generous);
    text-align: center;
  }
  .mark {
    width: var(--size-welcome-mark);
    height: var(--size-welcome-mark);
  }
  .slide {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-large-title);
    text-wrap: balance;
  }
  p {
    margin: 0;
    color: var(--color-text-secondary);
    text-wrap: pretty;
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: var(--space-close);
  }
  .dot {
    width: var(--size-page-dot);
    height: var(--size-page-dot);
    border-radius: var(--radius-circle);
    background: var(--color-separator);
  }
  .dot.current {
    background: var(--color-text);
  }
</style>
