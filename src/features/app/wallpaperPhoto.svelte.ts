/**
 * Своё фото на обои — как картинка на экране: object URL, прочитанный с диска один раз за
 * запуск. Одно на приложение, а не на комнату: иначе каждая открытая комната читала бы тот
 * же файл заново.
 */
import { wallpaperPhoto as storage } from '../../core/storage/wallpaper';

class WallpaperPhoto {
  /** Нет — ещё не прочитано, или прочитать нечего; тогда переписка просто на своём фоне. */
  url = $state<string | undefined>(undefined);
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    void storage.load().then((blob) => {
      if (blob && !this.url) this.url = URL.createObjectURL(blob);
    });
  }

  /**
   * Выбранное фото — сразу обои. Не записалось — всё равно на экране: не пережило оно только
   * перезапуск, и устраивать из-за этого драму посреди выбора фона незачем.
   */
  async store(file: Blob): Promise<void> {
    this.replace(URL.createObjectURL(file));
    this.loaded = true;
    await storage.save(file).catch(() => {});
  }

  /** Выход из аккаунта стёр файл — забыть и картинку. */
  forget(): void {
    this.replace(undefined);
    this.loaded = false;
  }

  private replace(url: string | undefined): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = url;
  }
}

export const wallpaperPhoto = new WallpaperPhoto();
