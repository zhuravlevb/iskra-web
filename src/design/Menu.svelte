<!--
  Меню действий: у указателя — на десктопе, листом снизу — на телефоне.

  Нативный `<dialog>` с `showModal()`: верхний слой (никакая трансформация колонок его не
  обрежет), фокус внутри, `Esc` закрывает, фокус возвращается туда, откуда меню открыли.
  Стрелки ходят по пунктам, `Home`/`End` — к краям. Щелчок мимо — закрыть.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    /** Точка, у которой открыть (координаты окна). На листе не нужна. */
    x?: number;
    y?: number;
    /** Листом снизу — для пальца. */
    sheet?: boolean;
    label: string;
    onclose: () => void;
    children: Snippet;
  }
  let { open, x = 0, y = 0, sheet = false, label, onclose, children }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      place();
      items()[0]?.focus();
    }
    if (!open && dialog.open) dialog.close();
  });

  const items = () => [...(dialog?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];

  /** У точки, но целиком в окне: не влезает справа — левее, снизу — выше точки. */
  function place() {
    if (!dialog || sheet) return;
    const margin = 8;
    const { width, height } = dialog.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, innerWidth - width - margin));
    const top = y + height + margin > innerHeight ? Math.max(margin, y - height) : y;
    // CSSOM, а не атрибут `style`: строгая CSP атрибуты не пускает, свойства — пускает.
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  function onkeydown(event: KeyboardEvent) {
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') go(at + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'Tab') {
      event.preventDefault();
      onclose();
    }
  }

  /** Щелчок по подложке — это щелчок по самому `<dialog>`, а не по его содержимому. */
  function onclick(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }

  // Колёсико и перетаскивание подложки — тоже «мимо»: меню, оставшееся висеть над
  // уехавшей лентой, показывает не туда.
  function onwheel() {
    onclose();
  }
</script>

<dialog bind:this={dialog} class:sheet aria-label={label} {onclose} {onkeydown} {onclick} {onwheel}>
  <div class="menu" role="menu" aria-label={label}>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: var(--space-tight);
    min-width: var(--size-menu-width);
    max-width: calc(100vw - 2 * var(--space-close));
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-card);
    background: var(--color-glass-opaque);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.2);
  }
  dialog::backdrop {
    background: transparent;
  }
  dialog.sheet {
    inset: auto 0 0 0;
    width: 100%;
    max-width: none;
    padding: var(--space-close) var(--space-close) max(var(--space-close), env(safe-area-inset-bottom));
    border-radius: var(--radius-menu) var(--radius-menu) 0 0;
  }
  dialog.sheet::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  .menu {
    display: flex;
    flex-direction: column;
  }
  /* Пункты — кнопки с `role="menuitem"` у того, кто меню наполняет. */
  .menu :global([role^='menuitem']) {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .menu :global([role^='menuitem']:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  @media (hover: hover) {
    .menu :global([role^='menuitem']:hover) {
      background: var(--color-selected);
    }
  }
  .menu :global([role^='menuitem'].danger) {
    color: var(--color-danger);
  }
</style>
