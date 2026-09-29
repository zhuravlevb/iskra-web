<!--
  Первое, что видит человек.

  Как в нативной Искре: спрашиваем не «homeserver URL», а где живёт аккаунт, и держим
  слова протокола подальше от экрана. Два шага — адрес, потом вход.

  **Один путь внутрь, а не два.** Где сервер умеет OAuth или SSO, это и есть вход, а форма
  пароля — за тихой фразой для тех, кто знает, что она им нужна. Где не умеет — просто
  имя, пароль и кнопка.
-->
<script lang="ts">
  import { asset } from '../../design/asset';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import { discoverServer, SignInError, type ServerInfo, type SignInProblem } from '../../core/auth/server';
  import { signInWithPassword, startOAuth, startSso } from '../../core/auth/signIn';
  import { app } from '../../core/session/app.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';

  interface Props {
    problem?: SignInProblem;
    ended?: boolean;
  }
  let { problem: initialProblem, ended = false }: Props = $props();

  let address = $state('');
  let username = $state('');
  let password = $state('');
  let server = $state<ServerInfo | null>(null);
  let usingPassword = $state(false);
  let busy = $state(false);
  // Пропы — только начальное значение: дальше экран ведёт их сам.
  // svelte-ignore state_referenced_locally
  let problem = $state<SignInProblem | undefined>(initialProblem);
  // svelte-ignore state_referenced_locally
  let showEnded = $state(ended);

  const problemKey = (p: SignInProblem): TextKey => `signIn.problem.${p}`;
  const redirectWay = $derived(!!server && (!!server.oauth || server.sso));
  const showPasswordForm = $derived(!!server && server.password && (!redirectWay || usingPassword));

  async function run(task: () => Promise<void>) {
    busy = true;
    problem = undefined;
    showEnded = false;
    try {
      await task();
    } catch (error) {
      problem = error instanceof SignInError ? error.problem : 'unreachable';
    } finally {
      busy = false;
    }
  }

  function findServer(event: SubmitEvent) {
    event.preventDefault();
    if (!address.trim()) return;
    void run(async () => {
      server = await discoverServer(address, import.meta.env.DEV);
      if (server.username) username = server.username;
      usingPassword = false;
    });
  }

  function continueInBrowser(create = false) {
    const s = server;
    if (!s) return;
    void run(async () => {
      const url = s.oauth ? await startOAuth(s, { create }) : startSso(s);
      window.location.assign(url);
      // Страница уходит; кнопка остаётся занятой, пока не ушла.
      await new Promise(() => {});
    });
  }

  function submitPassword(event: SubmitEvent) {
    event.preventDefault();
    const s = server;
    if (!s || !username.trim() || !password) return;
    void run(async () => {
      const account = await signInWithPassword(s, username, password);
      password = '';
      await app.signIn(account);
    });
  }

  function startOver() {
    server = null;
    usingPassword = false;
    problem = undefined;
    password = '';
  }
</script>

<main class="sign-in">
  <header>
    <img src={asset('icons/icon.svg')} alt="" width="56" height="56" />
    <h1>{t('signIn.title')}</h1>
    <p class="secondary">{t('signIn.tagline')}</p>
  </header>

  {#if showEnded}
    <ProblemPanel title={t('session.ended.title')} message={t('session.ended.message')} />
  {/if}

  {#if !server}
    <form class="step" onsubmit={findServer}>
      <h2>{t('signIn.whereIsAccount')}</h2>
      <p class="secondary">{t('signIn.whereIsAccountHelp')}</p>
      <TextField
        bind:value={address}
        label={t('signIn.addressLabel')}
        placeholder={t('signIn.addressPlaceholder')}
        inputmode="url"
        autocomplete="url"
        autofocus
        disabled={busy}
        invalid={!!problem}
      />
      <PrimaryButton type="submit" wide {busy} disabled={!address.trim()}>{t('signIn.continue')}</PrimaryButton>
    </form>
  {:else}
    <div class="step">
      {#if redirectWay && !usingPassword}
        <h2>{t('signIn.readyTitle')}</h2>
        <p class="secondary">{t('signIn.readyHelp')}</p>
        <PrimaryButton wide {busy} onclick={() => continueInBrowser()}>{t('signIn.signIn')}</PrimaryButton>
        {#if server.canRegister}
          <QuietButton disabled={busy} onclick={() => continueInBrowser(true)}>{t('signIn.createAccount')}</QuietButton>
        {/if}
        {#if server.password}
          <QuietButton disabled={busy} onclick={() => (usingPassword = true)}>{t('signIn.usePasswordInstead')}</QuietButton>
        {/if}
      {/if}

      {#if showPasswordForm}
        <form class="step" onsubmit={submitPassword}>
          <TextField
            bind:value={username}
            label={t('signIn.username')}
            showLabel
            autocomplete="username"
            autofocus
            disabled={busy}
          />
          <TextField
            bind:value={password}
            label={t('signIn.password')}
            showLabel
            type="password"
            autocomplete="current-password"
            disabled={busy}
            invalid={problem === 'badCredentials'}
          />
          <PrimaryButton type="submit" wide {busy} disabled={!username.trim() || !password}>
            {t('signIn.signInWithPassword')}
          </PrimaryButton>
        </form>
      {/if}

      <QuietButton disabled={busy} onclick={startOver}>{t('signIn.differentAddress')}</QuietButton>
    </div>
  {/if}

  {#if problem}
    <ProblemPanel message={t(problemKey(problem))} />
  {/if}
</main>

<style>
  .sign-in {
    display: flex;
    flex-direction: column;
    gap: var(--space-generous);
    width: 100%;
    max-width: var(--size-sign-in-column);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-generous);
    padding-block-start: max(var(--space-generous), env(safe-area-inset-top));
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-normal);
    padding-block-start: var(--space-generous);
    text-align: center;
  }
  header img {
    width: var(--size-sign-in-mark);
    height: var(--size-sign-in-mark);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-large-title);
    text-wrap: balance;
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
  }
</style>
