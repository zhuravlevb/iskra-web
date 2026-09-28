<!-- Лицо строки списка: фото комнаты или собеседника, иначе существо или гроздь лиц. -->
<script lang="ts">
  import RoomAvatar from '../../design/RoomAvatar.svelte';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import { Photo, pixelsFor } from './faces.svelte.ts';

  let { room, session }: { room: RoomSummary; session: UserSession } = $props();

  const size = pixelsFor(3.5);
  const photo = $derived(new Photo(session, room.avatarUrl, size));
  const facePhotos = $derived(room.faces.map((face) => new Photo(session, face.avatarUrl, size)));
  const me = $derived.by(() => {
    const self = session.me();
    return { id: self.id, name: self.name, photo: new Photo(session, self.avatarUrl, size) };
  });
</script>

<RoomAvatar
  name={room.name ?? t('room.untitled')}
  seed={room.kind === 'space' ? undefined : room.avatarSeed}
  photo={photo.url}
  shape={room.kind === 'space' ? 'square' : 'circle'}
  mode={preferences.faces}
  faces={room.faces.map((face, i) => ({ seed: face.id, name: face.name, photo: facePhotos[i]?.url }))}
  me={{ seed: me.id, name: me.name, photo: me.photo.url }}
/>
