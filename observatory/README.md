# 观星台

[打开观星台](https://stars.oim.moe)

南师附中本部 600 毫米反射望远镜的观测助手。目标包含月球、七颗行星、38 颗亮星及 23 个深空天体。首页按当前条件筛选，可搜索或查看全部星表。天体详情支持复制赤经（十进制小时或度）和赤纬（十进制度），同时显示时分秒、度分秒和恒星或深空天体的 J2000 星表坐标。

## 坐标与时间

- 观测点固定在南京鼓楼区察哈尔路 37 号的[本部校区](https://www.openstreetmap.org/way/855459406)，采用校园代表点北纬 32.07972°、东经 118.75154°（WGS84），海拔暂取 50 米。校内望远镜的实测位置和海拔可以在 `public/sky.mjs` 的 `SITE` 中修正。站点不会请求设备定位。
- 页面显示北京时间与设备时钟偏差。Cloudflare Worker 从 `/api/time` 返回毫秒级 UTC 时间戳并禁止缓存。浏览器选用三次采样中往返最短的一次作为时间锚点，每 30 秒重新校时，用单调计时器在前台每秒重算。设备的系统时钟只用于测偏差。网络往返时延会影响偏差估计。
- 赤经 1 小时等于 15 度。详情默认给出当日真赤道与真春分点下的无折射站心视赤经和视赤纬。可切到 J2000。固定天体的 J2000 行取星表值，月球与行星的 J2000 行是实时站心位置，未加光行差。使用望远镜前应以控制台指定的单位及坐标类型为准。
- 月球和行星使用 Astronomy Engine 的站心星历。恒星视位置计入线性自行、站心视差、一级光行差、岁差与章动。深空天体以星表方向为基准。高度角采用标准折射模型，实际大气条件会改变近地平线高度。
- 观测筛选按天体类别检查太阳高度、日距、天体高度和附近月光。默认采用偏保守的城区阈值。阳光接近地平线或目标日距小于 20° 时，详情给出警示并禁用一键复制。列表的适合度来自几何与简化亮度条件，天气、实际光污染、地平遮挡和望远镜限位仍须在现场判断。

## 本地运行

要求 Node.js 22 或更新版本。

```bash
npm ci
npm test
npm run dev
```

打开 <http://127.0.0.1:8787>。生产打包运行 `npm run build`，输出 `dist/worker.mjs`。Worker 和页面资源共用一个可直接上传的 ES 模块包。

## 部署到 Cloudflare

构建后，使用有 Workers Scripts Write 权限的 Cloudflare API 令牌上传。令牌由环境变量提供。

```bash
curl --fail-with-body --request PUT \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --form 'metadata=@worker-metadata.json;type=application/json' \
  --form 'worker.mjs=@dist/worker.mjs;type=application/javascript+module' \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/stars"
```

在 Workers 的 Domains & Routes 页面添加自定义域名。现网对应 Worker 名称为 `stars`。

## 数据与许可

- [Astronomy Engine 2.1.19](https://github.com/cosinekitty/astronomy)，Don Cross，MIT。用于月球与行星星历、参考系转换和地平坐标。
- [HYG v4.1](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v41.csv)，David Nash / Astronomy Nexus，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 使用。保留所选 HIP 条目的 J2000 坐标、距离、自行与视星等。
- [OpenNGC](https://github.com/mattiaverga/OpenNGC/tree/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0/database_files)，Mattia Verga，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 使用。保留所选条目的坐标、V 波段星等与视直径，把时分秒、度分秒转换为十进制。
- 参考本仓库原有的 Night Sky 星图与亮星中文名。所选星表可通过 `python scripts/catalog.py hygdata_v41.csv NGC.csv addendum.csv` 重新生成。

`public/catalog.json` 的星表数据按 CC BY-SA 4.0 发布。本项目的应用代码依照仓库的 [MIT 许可证](../LICENSE) 发布。
