<!--
  Подтверждение необратимого. Нативный `<dialog>` с `showModal()`: он сам ловит фокус,
  возвращает его, когда закрыт, и закрывается по `Esc`.
-->
<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    /** Действие разрушительное: кнопка подтверждения — красная, а не акцентная. */
    destructive?: boolean;
    onconfirm: () => void;
    onclose: () => void;
  }
  let { open, title, message, confirmLabel, cancelLabel, destructive = false, onconfirm, onclose }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" aria-describedby="{id}-message" {onclose}>
  <h2 id="{id}-title">{title}</h2>
  <p id="{id}-message">{message}</p>
  <div class="actions">
    <!-- Ни одна из двух не выделена как «правильная»: фокус — на отмене. -->
    <button type="button" class="cancel" onclick={onclose}>{cancelLabel}</button>
    <button type="button" class="confirm" class:destructive onclick={onconfirm}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--size-sign-in-column));
    padding: var(--space-generous);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / var(--backdrop-menu-scrim));
  }
  h2 {
    margin: 0 0 var(--space-close);
    font-size: var(--font-size-title);
  }
  p {
    margin: 0 0 var(--space-generous);
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-close);
  }
  button {
    min-height: var(--tap-target);
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-circle);
    font-weight: 600;
    cursor: pointer;
  }
  .cancel {
    background: var(--color-incoming-bubble);
  }
  .confirm {
    background: var(--accent);
    color: var(--on-accent);
  }
  .confirm.destructive {
    background: var(--color-danger);
    color: var(--color-on-danger);
  }
</style>
