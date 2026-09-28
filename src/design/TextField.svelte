<!--
  Поле ввода. Подпись для скринридера обязательна, даже если на экране её нет:
  подсказка внутри поля исчезает, как только в нём что-то появилось.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  interface Props {
    value: string;
    label: string;
    /** Показывать подпись над полем или только скринридеру. */
    showLabel?: boolean;
    /** Не `url`: браузер отказался бы отправлять `matrix.org` без схемы. Для адреса — `inputmode="url"`. */
    type?: 'text' | 'password';
    placeholder?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    inputmode?: HTMLInputAttributes['inputmode'];
    autofocus?: boolean;
    disabled?: boolean;
    invalid?: boolean;
  }
  let {
    value = $bindable(''),
    label,
    showLabel = false,
    type = 'text',
    placeholder,
    autocomplete,
    inputmode,
    autofocus = false,
    disabled = false,
    invalid = false,
  }: Props = $props();

  const id = $props.id();
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (autofocus) input?.focus();
  });
</script>

<div class="field">
  <label for={id} class:visually-hidden={!showLabel}>{label}</label>
  <input
    bind:this={input}
    bind:value
    {id}
    {type}
    {placeholder}
    {autocomplete}
    {inputmode}
    {disabled}
    aria-invalid={invalid || undefined}
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
  />
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  label {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  input {
    min-height: max(var(--tap-target), var(--size-navigation-bar));
    padding: 0 var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    background: var(--color-background);
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: transparent;
  }
  input[aria-invalid='true'] {
    border-color: var(--color-danger);
  }
</style>
