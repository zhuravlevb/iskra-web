/**
 * Новый чат и новая комната.
 *
 * Личный чат — не «комната на двоих», а комната в `m.direct` (см. план): иначе он не
 * узнается как личный ни здесь, ни в других клиентах. Шифрование — сразу, с первого
 * события: комнату, созданную открытой и зашифрованную потом, первые сообщения уже прошли
 * открытыми.
 *
 * Открытую комнату читает каждый, кто вошёл, поэтому шифрования в ней нет — и об этом
 * говорит экран (`roomList.new.openMeansUnencrypted` нативной Искры). В закрытой — есть.
 */
import { ClientEvent, EventType, Preset, Visibility, type MatrixClient, type Room } from 'matrix-js-sdk';

const ROOM_ARRIVES_MS = 15_000;

/**
 * Комната, которую сервер только что создал, приходит к клиенту следующей синхронизацией.
 * Открыть её раньше — показать сырой ID и «Не удалось открыть чат». Ждём, но не вечно:
 * не пришла — всё равно открываем, лента подождёт сама.
 */
function arrived(client: MatrixClient, roomId: string): Promise<void> {
  if (client.getRoom(roomId)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      client.off(ClientEvent.Room, onRoom);
      resolve();
    };
    const onRoom = (room: Room) => room.roomId === roomId && done();
    const timer = setTimeout(done, ROOM_ARRIVES_MS);
    client.on(ClientEvent.Room, onRoom);
  });
}

const ENCRYPTION = { type: EventType.RoomEncryption, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } };

export const isMatrixId = (value: string): boolean => /^@[^:\s]+:[^\s]+$/.test(value.trim());

/** Личный чат с человеком. Уже есть — тот же, а не второй. */
export async function createDirect(client: MatrixClient, userId: string): Promise<string> {
  const id = userId.trim();
  const direct = (client.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
  const existing = (direct[id] ?? []).find((roomId) => {
    const membership = client.getRoom(roomId)?.getMyMembership();
    return membership === 'join' || membership === 'invite';
  });
  if (existing) return existing;
  const { room_id: roomId } = await client.createRoom({
    is_direct: true,
    invite: [id],
    preset: Preset.TrustedPrivateChat,
    visibility: Visibility.Private,
    initial_state: [ENCRYPTION],
  });
  await client.setAccountData(EventType.Direct, { ...direct, [id]: [...(direct[id] ?? []), roomId] } as never);
  await arrived(client, roomId);
  return roomId;
}

export async function createGroup(client: MatrixClient, name: string, open: boolean): Promise<string> {
  const { room_id: roomId } = await client.createRoom({
    name: name.trim(),
    preset: open ? Preset.PublicChat : Preset.PrivateChat,
    visibility: Visibility.Private,
    initial_state: open ? [] : [ENCRYPTION],
  });
  await arrived(client, roomId);
  return roomId;
}
