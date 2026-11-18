import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as A from 'astronomy-engine';
import { calculateSky, displayCoordinates, parseAngle } from '../public/sky.mjs';
import worker from '../dist/worker.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url)));
const date = new Date('2026-11-18T15:00:00Z');

test('coordinates preserve a negative declination near zero and wrap right ascension', () => {
  const converted = displayCoordinates(parseAngle('05h35m17.30s', true), parseAngle('−00°30′00″', false));
  assert.equal(converted.raHours, '5.588139');
  assert.equal(converted.raDegrees, '83.822083');
  assert.equal(converted.decDegrees, '-0.500000');
  assert.equal(converted.original.dec, '−00° 30′ 00.00″');
  assert.equal(displayCoordinates(23.999999999, -0).original.ra, '00h 00m 00.00s');
  assert.equal(parseAngle('24:00:00', true), 0);
  assert.throws(() => parseAngle('90:00:01', false));
  assert.throws(() => parseAngle('10:60:01', true));
});

test('night-time moon has live topocentric coordinates in both frames', () => {
  const first = calculateSky(A, date, catalog, 'moon');
  const moon = first.targets.find(target => target.id === 'moon');
  const updated = calculateSky(A, new Date(+date + 1000), catalog, 'moon').targets[0];
  assert.ok(first.sunAltitude < -18);
  assert.equal(first.targets.length, 69);
  assert.ok(moon.ra > 0 && moon.ra < 24 && Math.abs(moon.dec) < 90);
  assert.notEqual(moon.ra, moon.reference.ra);
  // JPL Horizons, Moon (301), apparent airless RA/Dec at SITE at 15:00 UTC.
  const arcseconds = 3600;
  assert.ok(Math.abs(moon.ra * 15 - 339.56930) * arcseconds < 10);
  assert.ok(Math.abs(moon.dec - (-7.54429)) * arcseconds < 10);
  assert.notEqual(displayCoordinates(moon.ra, moon.dec).raHours, displayCoordinates(updated.ra, updated.dec).raHours);
  const stars = first.targets.filter(target => target.kind === 'star');
  assert.ok(stars.every(target => Number.isFinite(target.altitude) && Number.isFinite(target.ra)));
  assert.ok(first.targets.some(target => target.reason === '在地平线下'));
});

test('daytime suppresses all observing recommendations', () => {
  const day = calculateSky(A, new Date('2026-11-18T04:00:00Z'), catalog);
  assert.ok(day.sunAltitude > 0);
  assert.ok(day.targets.every(target => target.reason && target.solarRestricted));
});

test('HTTP serves clock uncached, assets in both encodings and standard error statuses', async () => {
  const request = (path, options) => new Request('https://stars.example' + path, options);
  const time = await worker.fetch(request('/api/time'));
  assert.match(time.headers.get('cache-control'), /no-store/);
  const { unixMs } = await time.json();
  assert.ok(Math.abs(Date.now() - unixMs) < 1500);
  const gzip = await worker.fetch(request('/astronomy.js', { headers: { 'Accept-Encoding': 'br, gzip' } }));
  assert.equal(gzip.headers.get('content-encoding'), 'gzip');
  const encodingOff = await worker.fetch(request('/astronomy.js', { headers: { 'Accept-Encoding': 'gzip;q=0' } }));
  assert.equal(encodingOff.headers.get('content-encoding'), null);
  assert.match(await encodingOff.text(), /Astronomy library/);
  assert.equal((await worker.fetch(request('/missing'))).status, 404);
  assert.equal((await worker.fetch(request('/', { method: 'POST' }))).status, 405);
  assert.equal(await (await worker.fetch(request('/', { method: 'HEAD' }))).text(), '');
});
