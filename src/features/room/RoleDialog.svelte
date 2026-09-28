<!-- «Что может Борис?» — три роли словами; предлагаются только те, что не выше своей. -->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import type { MemberSummary, RoomDetailsStore, RoomRole } from '../../core/rooms/roomDetails.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';

  let { member, details, onclose }: { member: MemberSummary | null; details: RoomDetailsStore; onclose: () => void } = $props();

  const labels: Record<RoomRole, TextKey> = { administrator: 'room.administrator', moderator: 'room.moderator', member: 'room.manage.member' };

  async function choose(role: RoomRole) {
    if (!member) return;
    const target = member;
    onclose();
    await details.setRole(target, role);
  }
</script>

<Dialog open={!!member} title={t('room.manage.roleQuestion', { name: member?.name ?? '' })} {onclose}>
  {#if member}
    <div class="roles" role="radiogroup" aria-label={t('room.manage.roleHeader')}>
      {#each details.rolesFor(member) as role (role)}
        <button type="button" role="radio" aria-checked={member.role === role} class:chosen={member.role === role} onclick={() => void choose(role)}>
          {t(labels[role])}
        </button>
      {/each}
    </div>
    <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
  {/if}
</Dialog>

<style>
  .roles {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  button {
    display: flex;
    align-items: center;
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  button + button {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  button.chosen {
    font-weight: 600;
    color: var(--accent);
  }
</style>
