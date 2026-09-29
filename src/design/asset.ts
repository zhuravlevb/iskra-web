/**
 * Адрес своего файла из `public/` с учётом базового пути сборки: в корне домена это `/`,
 * на GitHub Pages — `/iskra-web/`. Писать `/icons/…` напрямую нельзя: на Pages это чужой
 * корень.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
