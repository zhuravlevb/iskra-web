import { describe, expect, it } from 'vitest';
import { geoUri, parseGeoUri } from '../../src/core/timeline/location';

describe('geo: — место в сообщении', () => {
  it('широта, долгота; высота отбрасывается, точность читается', () => {
    expect(parseGeoUri('geo:55.7558,37.6173')).toEqual({ latitude: 55.7558, longitude: 37.6173 });
    expect(parseGeoUri('geo:55.7558,37.6173,150')).toEqual({ latitude: 55.7558, longitude: 37.6173 });
    expect(parseGeoUri('geo:55.7558,37.6173;u=35')).toEqual({ latitude: 55.7558, longitude: 37.6173, accuracy: 35 });
    expect(parseGeoUri('GEO:-33.9,151.2')).toEqual({ latitude: -33.9, longitude: 151.2 });
  });

  it('не место на Земле — ничего', () => {
    expect(parseGeoUri('geo:900,37')).toBeUndefined();
    expect(parseGeoUri('geo:55,190')).toBeUndefined();
    expect(parseGeoUri('geo:55')).toBeUndefined();
    expect(parseGeoUri('geo:abc,def')).toBeUndefined();
    expect(parseGeoUri('https://maps.example/55,37')).toBeUndefined();
    expect(parseGeoUri('')).toBeUndefined();
  });

  it('туда и обратно: шесть знаков и точность в метрах', () => {
    const uri = geoUri({ latitude: 55.755831, longitude: 37.617673, accuracy: 1234.6 });
    expect(uri).toBe('geo:55.755831,37.617673;u=1235');
    expect(parseGeoUri(uri)).toEqual({ latitude: 55.755831, longitude: 37.617673, accuracy: 1235 });
  });
});
