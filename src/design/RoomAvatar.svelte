<!--
  Лицо чата. У группы без своей картинки — «гроздь» лиц собеседников и своё, как
  `FaceCluster` нативной Искры: до двух других и я. Места и доли — оттуда же.
-->
<script lang="ts">
  import Avatar, { type FaceMode } from './Avatar.svelte';

  export interface Face {
    seed: string;
    name: string;
    photo?: string;
  }

  interface Props {
    name: string;
    seed?: string;
    photo?: string;
    /** Собеседники группы — без меня. */
    faces?: Face[];
    me?: Face;
    shape?: 'circle' | 'square';
    mode?: FaceMode;
  }
  let { name, seed, photo, faces = [], me, shape = 'circle', mode = 'creatures' }: Props = $props();

  const cluster = $derived.by(() => {
    if (mode === 'initials' || shape === 'square' || !me || faces.length === 0) return null;
    if (photo && mode !== 'creaturesAlways') return null;
    return [...faces.slice(0, 2), me];
  });

  /** (x, y, доля) в долях круга — ровно как в нативной Искре. */
  const places = $derived(
    cluster?.length === 2
      ? [[0.31, 0.33, 0.72], [0.69, 0.67, 0.72]]
      : [[0.5, 0.26, 0.64], [0.26, 0.73, 0.64], [0.74, 0.73, 0.64]],
  );
</script>

{#if cluster}
  <span class="cluster" aria-hidden="true">
    {#each cluster as face, i (face.seed)}
      {@const [x, y, fraction] = places[i]!}
      <!-- Существу слот просторнее, чем фото: его тело — три четверти коробки. -->
      {@const scale = fraction! * (face.photo && mode !== 'creaturesAlways' ? 1 : 1.12)}
      <span class="slot" style:--x={x} style:--y={y} style:--scale={scale}>
        <Avatar name={face.name} seed={face.seed} photo={face.photo} {mode} />
      </span>
    {/each}
  </span>
{:else}
  <Avatar {name} {seed} {photo} {shape} {mode} />
{/if}

<style>
  .cluster {
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--size-room-avatar);
    height: var(--size-room-avatar);
    border-radius: var(--radius-circle);
    overflow: hidden;
  }
  .slot {
    position: absolute;
    --avatar-size: calc(var(--size-room-avatar) * var(--scale));
    left: calc(var(--size-room-avatar) * var(--x) - var(--avatar-size) / 2);
    top: calc(var(--size-room-avatar) * var(--y) - var(--avatar-size) / 2);
    display: flex;
  }
</style>
