const radians = Math.PI / 180;
const auPerParsec = 648000 / Math.PI;
const speedOfLight = 173.1446326846693; // AU per day
const daysPerYear = 365.25;
const masToRad = radians / 3600000;

export const SITE = Object.freeze({ latitude: 32.07972, longitude: 118.75154, height: 50 });
export const LABELS = {
  solar: '月球与行星', star: '亮星', cluster: '星团', nebula: '星云', galaxy: '星系'
};
export const BODIES = [
  ['moon', '月球', 'Moon', '可从月面明暗交界附近找环形山。'],
  ['mercury', '水星', 'Mercury', '通常只在日落后或日出前短时间达到筛选条件。'],
  ['venus', '金星', 'Venus', '高倍下可观察盈亏。'],
  ['mars', '火星', 'Mars', '靠近冲日时，视圆面较大。'],
  ['jupiter', '木星', 'Jupiter', '可先用低倍找伽利略卫星。'],
  ['saturn', '土星', 'Saturn', '可尝试观测土星环及土卫六。'],
  ['uranus', '天王星', 'Uranus', '建议先用低倍定位，再辨认小圆面。'],
  ['neptune', '海王星', 'Neptune', '目标较暗，建议对照星图确认。']
].map(([id, name, body, note]) => ({ id, name, alias: body, body, note, kind: 'solar' }));

function vector(ra, dec) {
  const a = ra * 15 * radians;
  const d = dec * radians;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function separation(a, b) {
  const cosine = dot(vector(a.ra, a.dec), vector(b.ra, b.dec));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / radians;
}

function fixedEquatorial(A, item, context) {
  const { time, rotation, position, velocity } = context;
  const direction = vector(item.ra, item.dec);
  let line = direction;
  if (item.kind === 'star') {
    const a = item.ra * 15 * radians;
    const d = item.dec * radians;
    const east = [-Math.sin(a), Math.cos(a), 0];
    const north = [-Math.cos(a) * Math.sin(d), -Math.sin(a) * Math.sin(d), Math.cos(d)];
    const years = time.tt / daysPerYear;
    const distance = item.distance && item.distance < 10000 ? item.distance * auPerParsec : Infinity;
    line = direction.map((component, i) => component
      + years * masToRad * ((item.pmRa || 0) * east[i] + (item.pmDec || 0) * north[i])
      - position[i] / distance);
  }
  const length = Math.hypot(...line);
  const unit = line.map(component => component / length);
  // First-order annual and diurnal aberration. Rotate to true equator and equinox of date.
  const parallel = dot(unit, velocity);
  const [x, y, z] = unit.map((component, i) =>
    component + (velocity[i] - parallel * component) / speedOfLight);
  return A.EquatorFromVector(A.RotateVector(rotation, new A.Vector(x, y, z, time)));
}

function status(item, altitude, sunAltitude, elongation, moonSeparation, moonFraction) {
  if (sunAltitude >= -1) return '太阳接近或高于地平线';
  if (elongation < 20) return '与太阳角距小于 20°';
  const deep = item.kind !== 'star' && item.kind !== 'solar';
  const faintPlanet = item.id === 'uranus' || item.id === 'neptune';
  const altitudeLimit = deep ? (item.kind === 'galaxy' ? 30 : 25)
    : (item.id === 'hip30438' ? 4 : item.kind === 'solar' && !faintPlanet ? 10 : 15);
  if (altitude < altitudeLimit) return altitude < 0 ? '在地平线下' : '高度低于 ' + altitudeLimit + '°';
  const twilightLimit = deep || faintPlanet ? -12 : item.kind === 'star' ? -6 : -1;
  if (sunAltitude > twilightLimit) return '天光过亮';
  if (deep && moonFraction > 0.35 && moonSeparation < (item.kind === 'galaxy' ? 35 : 22)) {
    return '附近月光较强';
  }
  return '';
}

export function calculateSky(A, date, catalog, selectedId = '') {
  const time = A.MakeTime(date);
  const observer = new A.Observer(SITE.latitude, SITE.longitude, SITE.height);
  const sun = A.Equator(A.Body.Sun, time, observer, true, true);
  const sunAltitude = A.Horizon(time, observer, sun.ra, sun.dec).altitude;
  const moon = A.Equator(A.Body.Moon, time, observer, true, true);
  const moonAltitude = A.Horizon(time, observer, moon.ra, moon.dec, 'normal').altitude;
  const moonFraction = moonAltitude > 0 ? A.Illumination(A.Body.Moon, time).phase_fraction : 0;
  const earth = A.BaryState(A.Body.Earth, time);
  const ground = A.ObserverState(time, observer, false);
  const context = {
    time,
    rotation: A.Rotation_EQJ_EQD(time),
    position: [earth.x + ground.x, earth.y + ground.y, earth.z + ground.z],
    velocity: [earth.vx + ground.vx, earth.vy + ground.vy, earth.vz + ground.vz]
  };
  const targets = [...BODIES, ...catalog].map(item => {
    const eq = item.body
      ? (item.id === 'moon' ? moon : A.Equator(A.Body[item.body], time, observer, true, true))
      : fixedEquatorial(A, item, context);
    const horizon = A.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    const elongation = separation(eq, sun);
    const moonSeparation = separation(eq, moon);
    const reason = status(item, horizon.altitude, sunAltitude, elongation, moonSeparation, moonFraction);
    let reference = { ra: item.ra, dec: item.dec };
    let mag = item.mag;
    if (item.body && selectedId === item.id) {
      reference = A.Equator(A.Body[item.body], time, observer, false, false);
      mag = A.Illumination(A.Body[item.body], time).mag;
    }
    return {
      ...item, ra: eq.ra, dec: eq.dec, reference, mag,
      altitude: horizon.altitude, azimuth: horizon.azimuth,
      elongation, reason, solarRestricted: sunAltitude >= -1 || elongation < 20
    };
  });
  return { sunAltitude, targets };
}

const pad = (n, length = 2) => String(n).padStart(length, '0');
const absoluteParts = (value, wrap) => {
  let centiseconds = Math.round(Math.abs(value) * 360000);
  if (wrap) centiseconds %= wrap * 360000;
  return [
    pad(Math.floor(centiseconds / 360000)),
    pad(Math.floor(centiseconds / 6000) % 60),
    pad(((centiseconds % 6000) / 100).toFixed(2), 5)
  ];
};

export function sexagesimal(ra, dec) {
  const [h, m, s] = absoluteParts(ra, 24);
  const [d, am, as] = absoluteParts(dec);
  return {
    ra: h + 'h ' + m + 'm ' + s + 's',
    dec: (dec < 0 || Object.is(dec, -0) ? '−' : '+') + d + '° ' + am + '′ ' + as + '″'
  };
}

export function parseAngle(raw, isRa) {
  const text = raw.trim().replace(/[−–]/g, '-');
  const triplet = /^([+-]?\d+)\s*(?:[:：hH°时度]|\s)\s*(\d+)\s*(?:[:：mM′'分]|\s)\s*(\d+(?:\.\d+)?)\s*[sS″"秒]?$/.exec(text);
  if (!triplet) throw new Error('请输入三个数，例如 ' + (isRa ? '05:35:17.30' : '−05:23:28.00'));
  const [, first, second, third] = triplet;
  const limit = isRa ? 24 : 90;
  const degrees = Math.abs(Number(first)) + Number(second) / 60 + Number(third) / 3600;
  if (Number(second) >= 60 || Number(third) >= 60 || degrees > limit || (isRa && first.startsWith('-'))) {
    throw new Error(isRa ? '赤经应在 0 至 24 小时内，分和秒各小于 60。' : '赤纬应在 ±90 度内，分和秒各小于 60。');
  }
  return isRa && degrees === 24 ? 0 : degrees * (first.startsWith('-') ? -1 : 1);
}

export function displayCoordinates(ra, dec) {
  const signed = (dec < 0 || Object.is(dec, -0) ? '-' : '+') + Math.abs(dec).toFixed(6);
  return {
    raHours: (Number(ra.toFixed(6)) % 24).toFixed(6),
    raDegrees: (Number((ra * 15).toFixed(6)) % 360).toFixed(6),
    decDegrees: signed,
    original: sexagesimal(ra, dec)
  };
}
