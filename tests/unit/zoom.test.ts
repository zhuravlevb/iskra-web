import { describe, expect, it } from 'vitest';
import { clampPan, identity, MAX_SCALE, zoomAt } from '../../src/features/media/zoom';

describe('приближение в просмотрщике', () => {
  it('к точке: точка картинки под курсором остаётся под курсором', () => {
    const point = { x: 100, y: -50 };
    const view = zoomAt(identity, 2, point.x, point.y);
    // Точка картинки p (в координатах картинки на масштабе 1) видна в x + p * scale.
    const before = point.x; // на масштабе 1 без сдвига точка картинки = точка экрана
    expect(view.x + before * view.scale).toBeCloseTo(point.x);
    const again = zoomAt(view, 4, point.x, point.y);
    expect(again.x + before * again.scale).toBeCloseTo(point.x);
    expect(again.y + point.y * again.scale).toBeCloseTo(point.y);
  });

  it('масштаб — в пределах; на минимуме картинка возвращается в центр', () => {
    expect(zoomAt(identity, 100, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 3, x: 40, y: 40 }, 0.5, 10, 10)).toEqual(identity);
  });

  it('за картинку не утаскивается пустота', () => {
    const fit = { width: 400, height: 300 };
    const stage = { width: 400, height: 600 };
    const view = clampPan({ scale: 2, x: 1000, y: 1000 }, fit, stage);
    expect(view.x).toBe(200); // (800 − 400) / 2
    expect(view.y).toBe(0); // 600 > 300·2 — по вертикали некуда двигать
  });
});
