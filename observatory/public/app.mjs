import { BODIES, LABELS, calculateSky, displayCoordinates, parseAngle, sexagesimal } from './sky.mjs';

const byId = id => document.getElementById(id);
const set = (id, value) => {
  const target = byId(id);
  if (target.textContent !== value) target.textContent = value;
};
const direction = az => ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(az / 45) % 8];
const angle = n => n.toFixed(1) + '°';
const icons = { solar: '◐', star: '✦', cluster: '⁙', nebula: '◌', galaxy: '◎' };
const query = new URLSearchParams(location.search);
const selectedId = query.get('target') || '';
const converter = query.get('view') === 'converter' && !selectedId;
const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit'
});
const clockLight = byId('clock-light');
let anchor;
let syncing = false;
let syncFailed = false;
let nextSync = 0;
let lastTick;
let catalog;
let selected;
let showingAll = false;
let lastSky;
let toastTimer;
let renderedIds = [];
const renderedRows = new Map();

byId('home').hidden = Boolean(selectedId || converter);
byId('detail').hidden = !selectedId;
byId('converter').hidden = !converter;
if (converter) document.title = '坐标换算 · 观星台';

async function syncClock() {
  if (syncing) return;
  syncing = true;
  let best;
  for (let i = 0; i < 3; i++) {
    try {
      const started = performance.now();
      const response = await fetch('/api/time', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Server clock unavailable');
      const body = await response.json();
      const ended = performance.now();
      if (!Number.isSafeInteger(body.unixMs)) throw new Error('Invalid clock sample');
      const sample = { serverMs: body.unixMs, midpoint: (started + ended) / 2, roundTrip: ended - started };
      if (!best || sample.roundTrip < best.roundTrip) best = sample;
    } catch {
      if (!best && i === 1) break;
    }
    if (best && (!anchor || i === 2)) {
      anchor = best;
      syncFailed = false;
      tick();
    }
  }
  if (best) {
    anchor = best;
    syncFailed = false;
  } else {
    syncFailed = true;
  }
  syncing = false;
  nextSync = performance.now() + (best ? 30000 : 6000);
  tick();
}

function tick() {
  const monotonic = performance.now();
  const local = Date.now();
  if (!syncing && monotonic >= nextSync && !document.hidden) void syncClock();
  if (!anchor) {
    set('clock-status', syncFailed ? '暂时无法从服务器校时，正在重试' : '正在从服务器校时…');
    return;
  }
  const milliseconds = anchor.serverMs + monotonic - anchor.midpoint;
  const now = new Date(milliseconds);
  const difference = local - milliseconds;
  const delay = monotonic - anchor.midpoint;
  const stale = delay > 90000 || syncFailed;
  const drift = Math.abs(difference);
  const relation = drift < 50 ? '设备时钟偏差小于 0.05 秒' : '设备' + (difference > 0 ? '快 ' : '慢 ') + (drift / 1000).toFixed(2) + ' 秒';
  clockLight.className = 'light ' + (stale ? 'stale' : 'synced');
  set('clock-time', formatter.format(now));
  byId('clock-time').dateTime = now.toISOString();
  set('clock-status', (stale ? '校时中 · ' : '服务器已校时 · ') + relation);
  const second = Math.floor(milliseconds / 1000);
  if (!catalog || lastTick === second || converter || (selectedId && !selected)) return;
  lastTick = second;
  lastSky = calculateSky(window.Astronomy, new Date(second * 1000), catalog, selectedId);
  if (selected) renderDetail(lastSky.targets.find(target => target.id === selected.id));
  else renderList();
}

function twilight(altitude) {
  if (altitude > 0) return '白昼';
  if (altitude > -6) return '民用曙暮光';
  if (altitude > -12) return '航海曙暮光';
  if (altitude > -18) return '天文曙暮光';
  return '天文夜';
}

function renderList() {
  if (!lastSky) return;
  const { targets, sunAltitude } = lastSky;
  const filter = byId('kind').value;
  const search = byId('search').value.toLowerCase().replace(/\s+/g, '');
  const list = targets.filter(x => (showingAll || !x.reason) && (!filter || x.kind === filter)
    && (!search || [x.name, x.alias, x.catalog, x.id].some(s => s?.toLowerCase().replace(/\s+/g, '').includes(search))))
    .sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason)) || b.altitude - a.altitude);
  set('sun-height', angle(sunAltitude));
  set('twilight', twilight(sunAltitude));
  set('list-summary', (showingAll ? '星表' : '当前适合度筛选') + ' · ' + list.length + ' 个目标');
  byId('empty').hidden = list.length > 0;
  set('empty', search || filter ? '没有符合当前筛选条件的目标。'
    : sunAltitude >= -1 && !showingAll ? '太阳仍接近或高于地平线。可查看星表，提前选定目标。'
      : '当前没有目标达到观测条件。可点「查看全部」浏览星表。');
  const ids = list.map(target => target.id);
  const changed = ids.length !== renderedIds.length || ids.some((id, i) => id !== renderedIds[i]);
  for (const target of list) {
    let row = renderedRows.get(target.id);
    if (!row) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'target';
      link.href = '/?target=' + encodeURIComponent(target.id);
      link.innerHTML = '<span class="target-icon" aria-hidden="true"></span><span><span class="target-name"></span><span class="target-meta"></span></span><span class="target-info"><span class="target-alt"></span><span class="target-dir"></span></span><span class="target-next" aria-hidden="true">›</span>';
      item.append(link);
      link.querySelector('.target-icon').textContent = icons[target.kind];
      link.querySelector('.target-name').textContent = target.name;
      row = { item, meta: link.querySelector('.target-meta'), alt: link.querySelector('.target-alt'), dir: link.querySelector('.target-dir') };
      renderedRows.set(target.id, row);
    }
    const meta = target.reason || (LABELS[target.kind] + ' · ' + target.alias);
    const altitude = angle(target.altitude);
    const compass = direction(target.azimuth);
    if (row.meta.textContent !== meta) row.meta.textContent = meta;
    if (row.alt.textContent !== altitude) row.alt.textContent = altitude;
    if (row.dir.textContent !== compass) row.dir.textContent = compass;
  }
  if (changed) {
    const active = document.activeElement?.closest('.target');
    const items = ids.map(id => renderedRows.get(id).item);
    byId('targets').replaceChildren(...items);
    if (active?.isConnected) active.focus({ preventScroll: true });
    renderedIds = ids;
  }
}

function renderDetail(target) {
  const reference = byId('frame').value === 'reference';
  const coordinate = reference ? target.reference : target;
  const value = displayCoordinates(coordinate.ra, coordinate.dec);
  const frameDescription = reference
    ? (target.body ? '站心位置 · J2000 坐标轴 · 未加光行差' : '星表参考位置 · J2000')
    : '站心视位置 · 当日真赤道与真春分点';
  const mayCopy = !target.solarRestricted;
  set('frame-description', frameDescription);
  set('ra-hours', value.raHours);
  set('ra-degrees', value.raDegrees);
  set('dec-degrees', value.decDegrees);
  set('original-ra', value.original.ra);
  set('original-dec', value.original.dec);
  set('detail-status', target.reason || '当前符合观测筛选');
  set('alt-az', '高度 ' + angle(target.altitude) + ' · 方位 ' + angle(target.azimuth)
    + '（' + direction(target.azimuth) + '） · 日距 ' + angle(target.elongation)
    + (Number.isFinite(target.mag) ? ' · 视星等 ' + target.mag.toFixed(1) : ''));
  byId('solar-message').hidden = mayCopy;
  for (const button of byId('coordinate-content').querySelectorAll('[data-copy]')) button.disabled = !mayCopy;
  byId('detail-wait').hidden = true;
  byId('coordinate-content').hidden = false;
}

async function loadCatalog() {
  try {
    const response = await fetch('/catalog.json');
    if (!response.ok) throw new Error('Catalog unavailable');
    const objects = await response.json();
    if (!window.Astronomy) throw new Error('Astronomy Engine unavailable');
    catalog = objects;
    if (selectedId) {
      selected = [...BODIES, ...catalog].find(item => item.id === selectedId);
      if (!selected) {
        byId('detail').hidden = true;
        set('startup-error', '星表中没有这个目标。请通过左上角返回观测列表。');
        byId('startup-error').hidden = false;
        return;
      }
      document.title = selected.name + ' · 观星台';
      set('detail-name', selected.name);
      set('detail-kind', LABELS[selected.kind] + ' · ' + selected.alias + (selected.catalog && selected.catalog !== selected.alias ? ' / ' + selected.catalog : ''));
      set('detail-note', selected.note || '');
      if (!selected.body) {
        const source = sexagesimal(selected.ra, selected.dec);
        set('catalog-ra', source.ra);
        set('catalog-dec', source.dec);
        byId('catalog-coords').hidden = false;
      }
    }
    tick();
  } catch (error) {
    console.error(error);
    set('startup-error', '天文数据加载失败。请刷新页面重试。');
    byId('startup-error').hidden = false;
  }
}

byId('kind').addEventListener('change', renderList);
byId('search').addEventListener('input', renderList);
byId('show-all').addEventListener('click', event => {
  showingAll = !showingAll;
  event.currentTarget.setAttribute('aria-pressed', String(showingAll));
  event.currentTarget.textContent = showingAll ? '只看可观测' : '查看全部';
  renderList();
});
byId('frame').addEventListener('change', () => {
  if (selected && lastSky) renderDetail(lastSky.targets.find(item => item.id === selected.id));
});

byId('conversion').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const result = displayCoordinates(parseAngle(byId('input-ra').value, true), parseAngle(byId('input-dec').value, false));
    set('conversion-ra-hours', result.raHours);
    set('conversion-ra-degrees', result.raDegrees);
    set('conversion-dec', result.decDegrees);
    byId('conversion-result').hidden = false;
    byId('conversion-error').hidden = true;
  } catch (error) {
    set('conversion-error', error.message);
    byId('conversion-error').hidden = false;
    byId('conversion-result').hidden = true;
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-copy]');
  if (!button || button.disabled) return;
  const value = byId(button.dataset.copy);
  let message = '已复制 ' + value.textContent;
  try {
    await navigator.clipboard.writeText(value.textContent);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(value);
    selection.removeAllRanges();
    selection.addRange(range);
    message = '数值已选中，可手动复制';
  }
  set('toast', message);
  byId('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 2300);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void syncClock();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) void syncClock();
});
window.addEventListener('online', () => { void syncClock(); });
setInterval(() => { if (!document.hidden) tick(); }, 180);
void syncClock();
if (!converter) void loadCatalog();
