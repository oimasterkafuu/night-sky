"""Extract the selected targets from HYG v4.1 and OpenNGC CSV files."""
import csv
import json
import sys
from pathlib import Path

STARS = [
    (32349, '天狼星', 'Sirius'), (30438, '老人星', 'Canopus'),
    (69673, '大角星', 'Arcturus'), (91262, '织女星', 'Vega'),
    (24608, '五车二', 'Capella'), (24436, '参宿七', 'Rigel'),
    (37279, '南河三', 'Procyon'), (27989, '参宿四', 'Betelgeuse'),
    (97649, '河鼓二', 'Altair'), (21421, '毕宿五', 'Aldebaran'),
    (80763, '心宿二', 'Antares'), (65474, '角宿一', 'Spica'),
    (37826, '北河三', 'Pollux'), (113368, '北落师门', 'Fomalhaut'),
    (102098, '天津四', 'Deneb'), (49669, '轩辕十四', 'Regulus'),
    (33579, '弧矢七', 'Adhara'), (36850, '北河二', 'Castor'),
    (25336, '参宿五', 'Bellatrix'), (25428, '五车五', 'Elnath'),
    (26311, '参宿二', 'Alnilam'), (26727, '参宿一', 'Alnitak'),
    (54061, '天枢', 'Dubhe'), (62956, '玉衡', 'Alioth'),
    (67301, '摇光', 'Alkaid'), (65378, '开阳', 'Mizar'),
    (11767, '北极星（勾陈一）', 'Polaris'), (677, '壁宿二', 'Alpheratz'),
    (2081, '王良四', 'Caph'), (3179, '王良一', 'Schedar'),
    (15863, '天船三', 'Mirfak'), (14576, '大陵五', 'Algol'),
    (107315, '危宿三', 'Enif'), (113963, '室宿一', 'Markab'),
    (5447, '奎宿九', 'Mirach'), (7588, '天大将军一', 'Almach'),
    (85927, '尾宿八', 'Shaula'), (87833, '天棓四', 'Eltanin'),
]
DEEP = [
    ('m31', '仙女座星系', 'M31', 'galaxy', '城区可先找明亮的星系核心。'),
    ('m42', '猎户座大星云', 'M42', 'nebula', '可先找明亮的核心与四合星。'),
    ('m45', '昴星团', 'M45', 'cluster', '视直径较大，适合先用低倍。'),
    ('m44', '蜂巢星团', 'M44', 'cluster', '视直径较大，适合低倍扫视。'),
    ('m13', '武仙座球状星团', 'M13', 'cluster', '适合先用低倍定位，再提高倍率。'),
    ('m3', '猎犬座球状星团', 'M3', 'cluster', ''),
    ('m5', '巨蛇座球状星团', 'M5', 'cluster', ''),
    ('m15', '飞马座球状星团', 'M15', 'cluster', ''),
    ('m22', '人马座球状星团', 'M22', 'cluster', ''),
    ('m35', '双子座疏散星团', 'M35', 'cluster', ''),
    ('m36', '御夫座疏散星团 M36', 'M36', 'cluster', ''),
    ('m37', '御夫座疏散星团 M37', 'M37', 'cluster', ''),
    ('m38', '御夫座疏散星团 M38', 'M38', 'cluster', ''),
    ('m41', '大犬座疏散星团', 'M41', 'cluster', ''),
    ('m11', '野鸭星团', 'M11', 'cluster', ''),
    ('m57', '环状星云', 'M57', 'nebula', '小而紧凑，适合定位后提高倍率。'),
    ('m27', '哑铃星云', 'M27', 'nebula', '透明度好的夜晚更容易看到。'),
    ('m81', '波德星系', 'M81', 'galaxy', '优先寻找中心亮区。'),
    ('m82', '雪茄星系', 'M82', 'galaxy', ''),
    ('ngc869', '英仙座双星团 h', 'NGC0869', 'cluster', '另一个成员为 NGC 884。'),
    ('ngc884', '英仙座双星团 χ', 'NGC0884', 'cluster', ''),
    ('ngc2392', '双子座行星状星云', 'NGC2392', 'nebula', ''),
    ('ngc7662', '蓝雪球星云', 'NGC7662', 'nebula', ''),
]

def read(path, delimiter=','):
    with open(path, encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source, delimiter=delimiter))

def decimal(value):
    a, b, c = [float(part) for part in value.lstrip('-+').split(':')]
    return (-1 if value.startswith('-') else 1) * (a + b / 60 + c / 3600)

def number(value):
    return float(value) if value else None

def main(hyg, ngc, addendum):
    wanted = {str(hip) for hip, *_ in STARS}
    stars = {}
    for row in read(hyg):
        if row['hip'] in wanted:
            stars.setdefault(row['hip'], row)
    catalog = []
    for hip, name, alias in STARS:
        star = stars[str(hip)]
        catalog.append(dict(id='hip'+str(hip), name=name, alias=alias, kind='star',
                            catalog='HIP '+str(hip), ra=float(star['ra']), dec=float(star['dec']),
                            pmRa=number(star['pmra']), pmDec=number(star['pmdec']),
                            distance=number(star['dist']), mag=number(star['mag'])))
    rows = read(ngc, ';') + read(addendum, ';')
    lookup = {r['Name']: r for r in rows}
    lookup.update({'M'+str(int(r['M'])): r for r in rows if r['M'] and r['Type'] != 'Dup'})
    for id_, name, key, kind, note in DEEP:
        row = lookup[key]
        catalog.append(dict(id=id_, name=name, alias=key, kind=kind, note=note,
                            catalog=row['Name'], ra=round(decimal(row['RA']), 9),
                            dec=round(decimal(row['Dec']), 9), mag=number(row['V-Mag']),
                            majorArcmin=number(row['MajAx'])))
    dest = Path(__file__).resolve().parents[1] / 'public' / 'catalog.json'
    dest.write_text('[\n' + ',\n'.join(
        '  '+json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in catalog
    ) + '\n]\n', encoding='utf-8')

if __name__ == '__main__':
    main(*sys.argv[1:])
