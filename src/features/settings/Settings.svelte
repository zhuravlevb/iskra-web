<!--
  Настройки — одна страница с разделами, адрес ведёт к разделу (`#/settings/storage`).
  На десктопе — в колонке чата, на телефоне — вместо списка, как чат.

  Здесь только то, что работает: чего ещё нет (пуши, звонки), того и в настройках нет.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Avatar from '../../design/Avatar.svelte';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import type { SettingsSection } from '../../core/navigation/route';
  import { app } from '../../core/session/app.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { isPersisted, requestPersistence } from '../../core/storage/persistence';
  import { i18n, t, type TextKey } from '../../i18n/index.svelte.ts';
  import { accents, faceModes, fonts, preferences, type Accent, type Appearance, type FaceMode, type Font, type LanguageChoice } from '../app/preferences.svelte.ts';
  import { fileSize } from '../media/files';
  import RecoveryCode from '../recovery/RecoveryCode.svelte';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';

  let { session, section }: { session: UserSession; section?: SettingsSection } = $props();

  let page: HTMLElement | undefined = $state();

  // Раздел из адреса — прокрутить к нему.
  $effect(() => {
    const target = section;
    void tick().then(() => {
      if (target) page?.querySelector(`#settings-${target}`)?.scrollIntoView({ block: 'start' });
    });
  });

  // ————— Профиль —————

  const me = $derived(session.profile);
  const photo = $derived(new Photo(session, me.avatarUrl, pixelsFor(4)));
  let name = $state('');
  let savingName = $state(false);
  let profileProblem = $state<'name' | 'picture' | null>(null);
  let picker: HTMLInputElement | undefined = $state();
  onMount(() => {
    name = me.name === me.id ? '' : me.name;
  });
  const offline = $derived(session.connection === 'offline');

  async function saveName(event: SubmitEvent) {
    event.preventDefault();
    savingName = true;
    profileProblem = null;
    try {
      await session.setName(name);
    } catch {
      profileProblem = 'name';
    } finally {
      savingName = false;
    }
  }

  async function setPhoto(file: File | null) {
    profileProblem = null;
    try {
      await session.setPhoto(file ? { blob: file, name: file.name, type: file.type } : null);
    } catch {
      profileProblem = 'picture';
    }
  }

  function picked() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (file?.type.startsWith('image/')) void setPhoto(file);
  }

  // ————— Безопасность: код восстановления —————

  const recovery = $derived(session.recovery);
  let confirmNewCode = $state(false);
  let newCode = $state<string | null>(null);

  async function makeNewCode() {
    confirmNewCode = false;
    newCode = (await recovery?.makeNewKey()) ?? null;
  }

  // ————— Устройства —————

  let devices = $state<Awaited<ReturnType<UserSession['devices']>> | null>(null);
  let devicesFailed = $state(false);
  onMount(() => {
    session.devices().then(
      (list) => (devices = list),
      () => (devicesFailed = true),
    );
  });
  const accountPage = $derived(session.accountPage());

  // ————— Заблокированные —————

  // Только Matrix ID, без имён, как в нативной Искре: список — это ID, а имя может быть чьим угодно.
  const blocked = $derived(session.blocked);
  let unblocking = $state<string | null>(null);

  async function unblock(userId: string) {
    unblocking = userId;
    await blocked.unblock(userId);
    unblocking = null;
  }

  // ————— Хранилище —————

  let persisted = $state<boolean | null>(null);
  let usage = $state<{ used: number; quota: number } | null>(null);
  let clearing = $state(false);
  let confirmClear = $state(false);
  let clearFailed = $state(false);

  async function readStorage() {
    persisted = await isPersisted().catch(() => null);
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage !== undefined && estimate.quota) usage = { used: estimate.usage, quota: estimate.quota };
    } catch {
      usage = null;
    }
  }
  onMount(() => void readStorage());

  async function askPersistence() {
    await requestPersistence();
    await readStorage();
  }

  async function clearCache() {
    confirmClear = false;
    clearing = true;
    clearFailed = false;
    try {
      await session.clearCache();
      location.reload();
    } catch {
      clearing = false;
      clearFailed = true;
    }
  }

  // ————— Внешний вид —————

  const themes: Array<{ value: Appearance; label: TextKey }> = [
    { value: 'system', label: 'appearance.mode.system' },
    { value: 'light', label: 'appearance.mode.light' },
    { value: 'dark', label: 'appearance.mode.dark' },
  ];
  const faceLabels: Record<FaceMode, { label: TextKey; help: TextKey }> = {
    creatures: { label: 'onboarding.faces.mixed', help: 'onboarding.faces.mixedHelp' },
    initials: { label: 'onboarding.faces.pictures', help: 'onboarding.faces.picturesHelp' },
    creaturesAlways: { label: 'onboarding.faces.faces', help: 'onboarding.faces.facesHelp' },
  };
  const accentLabel = (accent: Accent): TextKey => `appearance.color.${accent}`;
  const fontLabel = (font: Font): TextKey => `appearance.font.${font}`;
  const languages: Array<{ value: LanguageChoice; label: TextKey }> = [
    { value: 'system', label: 'language.system' },
    { value: 'ru', label: 'language.ru' },
    { value: 'en', label: 'language.en' },
  ];

  // ————— Об Iskra —————

  const build = __ISKRA_BUILD__;
  let copied = $state(false);
  async function copyBuild() {
    const text = [`Iskra Web ${build}`, navigator.userAgent, `${i18n.locale} · ${session.method}`].join('\n');
    await navigator.clipboard?.writeText(text).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  let confirmingSignOut = $state(false);
</script>

<div class="settings" bind:this={page}>
  <section id="settings-profile" aria-labelledby="profile-title">
    <h2 id="profile-title">{t('account.editTitle')}</h2>
    <div class="profile">
      <span class="avatar"><Avatar name={me.name} seed={me.id} photo={photo.url} mode={preferences.faces} /></span>
      <span class="who">
        <strong>{me.name}</strong>
        <span class="secondary">{me.id}</span>
      </span>
    </div>
    <div class="buttons">
      <PlainButton disabled={offline} onclick={() => picker?.click()}>{t('account.changePicture')}</PlainButton>
      {#if me.avatarUrl}
        <PlainButton danger disabled={offline} onclick={() => void setPhoto(null)}>{t('account.removePicture')}</PlainButton>
      {/if}
      <input bind:this={picker} type="file" accept="image/*" hidden onchange={picked} />
    </div>
    <form class="stack" onsubmit={saveName}>
      <TextField bind:value={name} label={t('account.nameHeader')} showLabel placeholder={t('account.namePlaceholder')} disabled={offline} />
      <PrimaryButton type="submit" busy={savingName} disabled={offline || !name.trim() || name.trim() === me.name}>{t('room.manage.save')}</PrimaryButton>
    </form>
    {#if offline}<p class="secondary">{t('account.editOffline')}</p>{/if}
    {#if profileProblem}
      <p class="problem" role="alert">{t(profileProblem === 'name' ? 'account.nameFailed' : 'account.pictureFailed')}</p>
    {/if}
  </section>

  {#if recovery}
    <section id="settings-security" aria-labelledby="security-title">
      <h2 id="security-title">{t('settings.security')}</h2>
      {#if recovery.protection === 'on'}
        <p>{t('settings.deviceVerified')}</p>
        <h3>{t('settings.recoveryCode')}</h3>
        <PlainButton busy={recovery.working} onclick={() => (confirmNewCode = true)}>{t('settings.newCode')}</PlainButton>
      {:else}
        <p>{t('settings.deviceNotVerified')}</p>
        <PrimaryButton onclick={() => app.openRecovery()}>{t('recovery.choose.title')}</PrimaryButton>
      {/if}
      {#if recovery.failure}
        <p class="problem" role="alert">{t(`account.${recovery.failure}`)}</p>
      {/if}
    </section>
  {/if}

  <section id="settings-devices" aria-labelledby="devices-title">
    <h2 id="devices-title">{t('settings.devices')}</h2>
    {#if devices}
      <ul class="list">
        {#each devices as device (device.id)}
          <li>
            <strong>{device.name}</strong>
            <span class="secondary">{device.current ? t('settings.thisDevice') : device.id}</span>
          </li>
        {/each}
      </ul>
    {:else if devicesFailed}
      <p class="problem" role="alert">{t('settings.devicesFailed')}</p>
    {/if}
    <p class="secondary">{t('settings.devicesHelp')}</p>
    {#if accountPage}
      <a class="link" href={accountPage} target="_blank" rel="noopener noreferrer">{t('settings.openAccountPage')}</a>
    {/if}
  </section>

  <section id="settings-blocked" aria-labelledby="blocked-title">
    <h2 id="blocked-title">{t('settings.blocked')}</h2>
    {#if blocked.ids.length}
      <ul class="list">
        {#each blocked.ids as userId (userId)}
          <li class="row">
            <span class="id">{userId}</span>
            <PlainButton busy={unblocking === userId} disabled={offline} onclick={() => void unblock(userId)}>{t('settings.unblock')}</PlainButton>
          </li>
        {/each}
      </ul>
    {:else}
      <p>{t('settings.blockedEmptyTitle')}</p>
      <p class="secondary">{t('settings.blockedEmptyMessage')}</p>
    {/if}
    {#if blocked.failure === 'unblockFailed'}
      <p class="problem" role="alert">{t('account.unblockFailed')}</p>
    {/if}
  </section>

  <section id="settings-appearance" aria-labelledby="appearance-title">
    <h2 id="appearance-title">{t('settings.appearance')}</h2>
    <h3 id="theme-title">{t('appearance.theme')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="theme-title">
      {#each themes as theme (theme.value)}
        <button type="button" role="radio" aria-checked={preferences.appearance === theme.value} onclick={() => (preferences.appearance = theme.value)}>
          {t(theme.label)}
        </button>
      {/each}
    </div>
    <h3 id="accent-title">{t('appearance.accent')}</h3>
    <div class="swatches" role="radiogroup" aria-labelledby="accent-title">
      {#each accents as accent (accent)}
        <button
          type="button"
          role="radio"
          class="swatch"
          data-accent={accent}
          aria-checked={preferences.accent === accent}
          aria-label={t(accentLabel(accent))}
          title={t(accentLabel(accent))}
          onclick={() => (preferences.accent = accent)}
        ></button>
      {/each}
    </div>
    <h3 id="font-title">{t('appearance.font')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="font-title">
      {#each fonts as font (font)}
        <!-- Каждый вариант написан своим шрифтом: видно, что выбираешь. -->
        <button type="button" role="radio" data-font={font} aria-checked={preferences.font === font} onclick={() => (preferences.font = font)}>
          {t(fontLabel(font))}
        </button>
      {/each}
    </div>
    <h3 id="faces-title">{t('onboarding.faces.title')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="faces-title">
      {#each faceModes as mode (mode)}
        <button type="button" role="radio" aria-checked={preferences.faces === mode} onclick={() => (preferences.faces = mode)}>
          <span class="option">
            <span>{t(faceLabels[mode].label)}</span>
            <span class="secondary">{t(faceLabels[mode].help)}</span>
          </span>
        </button>
      {/each}
    </div>
    <h3 id="language-title">{t('settings.language')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="language-title">
      {#each languages as language (language.value)}
        <button type="button" role="radio" aria-checked={preferences.language === language.value} onclick={() => (preferences.language = language.value)}>
          {t(language.label)}
        </button>
      {/each}
    </div>
  </section>

  <section id="settings-storage" aria-labelledby="storage-title">
    <h2 id="storage-title">{t('storage.title')}</h2>
    {#if persisted !== null}
      <p>{persisted ? t('storage.persisted') : t('storage.notPersisted')}</p>
      {#if !persisted}
        <PlainButton onclick={() => void askPersistence()}>{t('storage.persist')}</PlainButton>
      {/if}
    {/if}
    <dl>
      <dt>{t('storage.total')}</dt>
      <dd>{usage ? t('storage.used', { used: fileSize(usage.used, i18n.locale), quota: fileSize(usage.quota, i18n.locale) }) : t('storage.measuring')}</dd>
    </dl>
    <h3>{t('storage.cache')}</h3>
    <p class="secondary">{t('storage.cacheWeb')}</p>
    <PlainButton busy={clearing} onclick={() => (confirmClear = true)}>{clearing ? t('storage.clearing') : t('storage.clear')}</PlainButton>
    {#if clearFailed}<p class="problem" role="alert">{t('storage.failed')}</p>{/if}
  </section>

  <section id="settings-about" aria-labelledby="about-title">
    <h2 id="about-title">{t('about.title')}</h2>
    <p>{t('about.webTagline')}</p>
    <dl>
      <dt>{t('about.build')}</dt>
      <dd>{build}</dd>
    </dl>
    <PlainButton onclick={() => void copyBuild()}>{copied ? t('about.copied') : t('about.copy')}</PlainButton>
    <h3>{t('about.builtOn')}</h3>
    <dl>
      <dt>{t('about.sdkWeb')}</dt>
      <dd>{t('about.sdkWebLicence')}</dd>
      <dt>{t('about.protocol')}</dt>
      <dd>{t('about.protocolExplained')}</dd>
    </dl>
    <p class="secondary">{t('about.cryptographyWeb')}</p>
  </section>

  <section>
    <PlainButton danger onclick={() => (confirmingSignOut = true)}>{t('account.signOut')}</PlainButton>
  </section>
</div>

<ConfirmDialog
  open={confirmNewCode}
  title={t('recovery.new.title')}
  message={t('recovery.new.message')}
  confirmLabel={t('recovery.new.confirm')}
  cancelLabel={t('recovery.new.keepOld')}
  destructive
  onclose={() => (confirmNewCode = false)}
  onconfirm={() => void makeNewCode()}
/>

<Dialog open={!!newCode} title={t('settings.recoveryCode')} onclose={() => (newCode = null)}>
  {#if newCode}
    <RecoveryCode code={newCode} userId={session.userId} onsaved={() => (newCode = null)} />
  {/if}
</Dialog>

<ConfirmDialog
  open={confirmClear}
  title={t('storage.confirm.title')}
  message={t('storage.cacheWeb')}
  confirmLabel={t('storage.confirm.action')}
  cancelLabel={t('storage.cancel')}
  onclose={() => (confirmClear = false)}
  onconfirm={() => void clearCache()}
/>

<ConfirmDialog
  open={confirmingSignOut}
  title={t('signOut.confirmTitle')}
  message={t('signOut.confirmMessage')}
  confirmLabel={t('account.signOut')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (confirmingSignOut = false)}
  onconfirm={() => {
    confirmingSignOut = false;
    void app.signOut();
  }}
/>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-generous);
    width: 100%;
    max-width: var(--column-timeline-max);
    height: 100%;
    margin-inline: auto;
    padding: var(--space-roomy) var(--timeline-gutter) max(var(--space-generous), env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
    scroll-margin-top: var(--space-roomy);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
  }
  h3 {
    margin: var(--space-close) 0 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  p {
    margin: 0;
  }
  .secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .problem {
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
  .profile {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
  }
  .avatar {
    --avatar-size: var(--size-avatar-large);
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .buttons {
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-close);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
  }
  .list li {
    display: flex;
    flex-direction: column;
    padding: var(--space-close) var(--space-normal);
  }
  /* Сеткой, а не флексом: `PlainButton` тянется на всю ширину, а колонка `auto` его держит. */
  .list li.row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-normal);
  }
  .id {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .list li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .options {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .options button {
    display: flex;
    align-items: center;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .options button[data-font='system'] {
    font-family: var(--font-system);
  }
  .options button[data-font='inter'] {
    font-family: 'Inter', var(--font-system);
  }
  .options button + button {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .options button[aria-checked='true']::after {
    content: '✓';
    margin-inline-start: auto;
    padding-inline-start: var(--space-close);
    color: var(--accent);
    font-weight: 700;
  }
  .option {
    display: flex;
    flex-direction: column;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-close);
  }
  /* Образец — свой акцент на себе: `data-accent` задаёт `--accent` (accent.css). */
  .swatch {
    width: var(--tap-target);
    height: var(--tap-target);
    border: 2px solid transparent;
    border-radius: var(--radius-circle);
    background: var(--accent-light);
    background-clip: content-box;
    padding: var(--space-tight);
    cursor: pointer;
  }
  .swatch[aria-checked='true'] {
    border-color: var(--accent-light);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-tight) var(--space-roomy);
    margin: 0;
  }
  dt {
    color: var(--color-text-secondary);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .link {
    color: var(--accent);
  }
</style>
