<!--
  Три экрана между новым входом и чатами: привет, цвет, мордочки (`FirstRunView` нативной
  Искры). Ничего здесь не трогает аккаунт: у каждого вопроса уже есть хороший ответ по
  умолчанию, поэтому у обоих — «Пропустить». Кто вошёл, хочет свои чаты, а не палитру.

  Шаги — по порядку и без возврата, поэтому и движение одно: новый въезжает справа, как
  перелистнутая страница. Уходящий исчезает сразу: его кнопки на миг рядом с новыми —
  это второй «Пропустить», который можно нажать.
-->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import Avatar from '../../design/Avatar.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import AccentSwatches from '../settings/AccentSwatches.svelte';
  import FacePicker from './FacePicker.svelte';
  import { ARRIVAL_MS, GREETING_MS, motion, PREVIEW_REPLY_MS, STEP_MS } from './timing';

  let { session, ondone }: { session: UserSession; ondone: () => void } = $props();

  let step = $state<'greeting' | 'appearance' | 'faces'>('greeting');
  const me = $derived(session.profile);
  const photo = $derived(new Photo(session, me.avatarUrl, pixelsFor(6)));
  const greeting = $derived(me.name && me.name !== me.id ? t('onboarding.greeting', { name: me.name.trim() }) : t('onboarding.greetingNameless'));

  // Привет — на часах и без кнопки: это приложение здоровается, а не шаг, который надо
  // подтвердить. На вебе его можно проскочить нажатием — мышь, которой некуда деться,
  // иначе щёлкает в пустоту.
  $effect(() => {
    if (step !== 'greeting') return;
    const timer = setTimeout(() => (step = 'appearance'), GREETING_MS);
    return () => clearTimeout(timer);
  });

  // Пример переписки на экране цвета — сказанный, а не показанный: реплики по одной.
  let spoken = $state(0);
  $effect(() => {
    if (step !== 'appearance') return;
    spoken = 0;
    const first = setTimeout(() => (spoken = 1), 16);
    const second = setTimeout(() => (spoken = 2), 16 + motion(PREVIEW_REPLY_MS));
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  });

  const enter = { x: 64, duration: motion(STEP_MS) };
  const leave = { x: -64, duration: motion(STEP_MS) };
</script>

<main class="first-run">
  {#if step === 'greeting'}
    <button type="button" class="greeting" in:fly={{ y: 12, duration: motion(ARRIVAL_MS) }} out:fly={leave} onclick={() => (step = 'appearance')}>
      <span class="avatar"><Avatar name={me.name} seed={me.id} photo={photo.url} mode={preferences.faces} /></span>
      <h1>{greeting}</h1>
    </button>
  {:else}
    {#key step}
      <!-- Только въезд: уходящий шаг с кнопками, которые ещё можно нажать, — второй «Пропустить» на экране. -->
      <div class="page" in:fly={enter}>
        <div class="content">
          {#if step === 'appearance'}
            <h1 id="first-run-title">{t('onboarding.appearance.title')}</h1>
            <p class="explanation">{t('onboarding.appearance.body')}</p>
            <div class="conversation" role="img" aria-label={t('appearance.previewLabel')}>
              <span class="bubble" class:said={spoken > 0}>{t('appearance.previewAsk')}</span>
              <span class="bubble own" class:said={spoken > 1}>{t('appearance.previewAnswer')}</span>
            </div>
            <AccentSwatches labelledby="first-run-title" />
          {:else}
            <h1 id="first-run-title">{t('onboarding.faces.title')}</h1>
            <p class="explanation">{t('onboarding.faces.body')}</p>
            <FacePicker />
          {/if}
        </div>
        <div class="actions">
          <PrimaryButton wide onclick={() => (step === 'appearance' ? (step = 'faces') : ondone())}>{t('onboarding.continue')}</PrimaryButton>
          <button type="button" class="skip" onclick={() => (step === 'appearance' ? (step = 'faces') : ondone())}>{t('onboarding.skip')}</button>
        </div>
      </div>
    {/key}
  {/if}
</main>

<style>
  .first-run {
    display: grid;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  /* Уходящий и приходящий шаг — в одной клетке сетки: пока один уступает другому, оба на месте. */
  .first-run > * {
    grid-area: 1 / 1;
  }
  .greeting {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-roomy);
    padding: var(--space-generous);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: center;
    cursor: default;
  }
  .avatar {
    --avatar-size: var(--size-avatar-profile);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-large-title);
    text-align: center;
    text-wrap: balance;
  }
  .page {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-generous);
    width: 100%;
    max-width: var(--size-sign-in-column);
    margin-inline: auto;
    padding: var(--space-generous);
    padding-block-start: max(var(--space-generous), env(safe-area-inset-top));
    overflow-y: auto;
  }
  .explanation {
    margin: calc(-1 * var(--space-close)) 0 0;
    color: var(--color-text-secondary);
    text-align: center;
    text-wrap: pretty;
  }
  /* Кнопки — внизу экрана, а не под содержимым: на двух экранах подряд они на одном месте. */
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    width: 100%;
    max-width: var(--size-sign-in-column);
    margin-inline: auto;
    padding: var(--space-close) var(--space-generous) max(var(--space-normal), env(safe-area-inset-bottom));
  }
  .skip {
    min-height: var(--tap-target);
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
  }
  .conversation {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  .bubble {
    align-self: flex-start;
    padding: var(--bubble-pad-y) var(--bubble-pad-x);
    border-radius: var(--radius-bubble);
    background: var(--color-incoming-bubble);
    opacity: 0;
    translate: 0 var(--space-normal);
    transition:
      opacity var(--timing-arrival) ease-out,
      translate var(--timing-arrival) ease-out,
      background-color var(--timing-reaction) ease-out;
  }
  .bubble.own {
    align-self: flex-end;
    background: var(--bubble-own);
    color: var(--on-bubble-own);
  }
  .bubble.said {
    opacity: 1;
    translate: 0 0;
  }
</style>
