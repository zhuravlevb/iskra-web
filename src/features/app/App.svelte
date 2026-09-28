<!-- Корень: какой экран — решает фаза приложения (`core/session/app.svelte.ts`). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../core/session/app.svelte.ts';
  import type { AuthCallback } from '../../core/auth/callback';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import SignIn from '../signin/SignIn.svelte';
  import Elsewhere from './Elsewhere.svelte';
  import Loading from './Loading.svelte';
  import Shell from './Shell.svelte';
  import UpdatePrompt from './UpdatePrompt.svelte';
  import { preferences } from './preferences.svelte.ts';

  let { authCallback }: { authCallback: AuthCallback | null } = $props();

  /** Другая вкладка просит показаться. Фокус окно может не дать — тогда мигнуть заголовком. */
  function answerPing() {
    window.focus();
    if (document.visibilityState === 'visible') return;
    const original = document.title;
    let flip = false;
    const timer = setInterval(() => {
      flip = !flip;
      document.title = flip ? t('elsewhere.pinged') : original;
    }, 1000);
    const stop = () => {
      if (document.visibilityState !== 'visible') return;
      clearInterval(timer);
      document.title = original;
      document.removeEventListener('visibilitychange', stop);
    };
    document.addEventListener('visibilitychange', stop);
  }

  onMount(() => {
    // Возврат со страницы входа читается один раз.
    void app.boot(authCallback, { onFocusRequested: answerPing });
    return preferences.persist();
  });

  $effect(() => {
    document.documentElement.lang = i18n.locale;
    // Вошедшему заголовок ведёт `badge.svelte.ts` — с числом непрочитанных.
    if (app.phase.name !== 'signed-in') document.title = t('app.name');
  });
</script>

{#if app.phase.name === 'loading'}
  <Loading />
{:else if app.phase.name === 'signed-out'}
  <SignIn problem={app.phase.problem} ended={app.phase.ended} />
{:else if app.phase.name === 'elsewhere'}
  <Elsewhere />
{:else}
  <Shell session={app.phase.session} />
{/if}

<UpdatePrompt />
