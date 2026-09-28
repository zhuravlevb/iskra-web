<!--
  Круглое лицо: фото, если есть; существо-blobatar или инициалы — пока его нет и если нет
  совсем. Заглушка — не спиннер: большинство людей фото не ставят, и список серых
  крутящихся кругов — это приложение, притворяющееся занятым. Размер круга один и тот же,
  так что строка не дёргается, когда фото приходит.

  Сид — идентификатор, а не имя (см. `faces.ts`). Нет сида — нет существа, только инициалы.
-->
<script lang="ts" module>
  /** Как рисовать лицо без фото — `FaceMode` нативной Искры. */
  export type FaceMode = 'creatures' | 'initials' | 'creaturesAlways';
</script>

<script lang="ts">
  import { creatureUri, initialsOf } from './faces';

  interface Props {
    name: string;
    seed?: string;
    /** Object URL фото — уже загруженного. */
    photo?: string;
    shape?: 'circle' | 'square';
    mode?: FaceMode;
  }
  let { name, seed, photo, shape = 'circle', mode = 'creatures' }: Props = $props();

  const creature = $derived(
    !!seed && (mode === 'creaturesAlways' || (mode === 'creatures' && !photo)),
  );
</script>

<span class="avatar" class:square={shape === 'square'} class:plate={!creature} aria-hidden="true">
  {#if creature && seed}
    <img src={creatureUri(seed)} alt="" draggable="false" />
  {:else if photo}
    <img class="photo" src={photo} alt="" draggable="false" />
  {:else}
    <span class="initials">{initialsOf(name)}</span>
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--avatar-size, var(--size-room-avatar));
    height: var(--avatar-size, var(--size-room-avatar));
    border-radius: var(--radius-circle);
    overflow: hidden;
    container-type: size;
  }
  .square {
    /* Пространство — скруглённый квадрат: отличается от чата раньше, чем прочитано имя. */
    border-radius: 28%;
  }
  /* Под существом подложки нет: оно рисует своё тело само и стоит прямо на фоне. */
  .plate {
    background: var(--color-incoming-bubble);
  }
  img {
    width: 100%;
    height: 100%;
    user-select: none;
  }
  .photo {
    object-fit: cover;
  }
  .initials {
    font-size: 40cqw;
    font-weight: 500;
    line-height: 1;
    color: var(--color-text-secondary);
  }
</style>
