#!/usr/bin/env python3
"""
下载成都「锦江十二月市」区域的真实卫星瓦片（Esri World Imagery），做成离线自包含。
输出目录：
  langu/tiles/{z}/{x}/{y}.png
  langu/vendor/leaflet.js , leaflet.css
瓦片坐标采用 Web Mercator（与 Leaflet 一致）。
"""
import os, math, sys, shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(ROOT, "tiles")
VENDOR_DIR = os.path.join(ROOT, "vendor")

# 成都十二月市核心区（锦江两岸）边界（含少量余量，便于拖拽/缩放）
LAT_MIN, LAT_MAX = 30.620, 30.685
LON_MIN, LON_MAX = 104.015, 104.125

ZOOMS = [13, 14, 15, 16]

ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
UA = "Mozilla/5.0 (compatible; langu-map-fetch/1.0)"


def lon2x(lon, z):
    n = 2 ** z
    return int(math.floor((lon + 180.0) / 360.0 * n))


def lat2y(lat, z):
    n = 2 ** z
    lat_rad = math.radians(lat)
    return int(math.floor((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n))


def tile_range(z):
    xs = [lon2x(LON_MIN, z), lon2x(LON_MAX, z)]
    ys = [lat2y(LAT_MIN, z), lat2y(LAT_MAX, z)]
    return min(xs), max(xs), min(ys), max(ys)


def fetch(tasks):
    def worker(job):
        z, x, y = job
        url = ESRI.format(z=z, x=x, y=y)
        out = os.path.join(TILES_DIR, str(z), str(x), f"{y}.png")
        if os.path.exists(out) and os.path.getsize(out) > 500:
            return ("skip", out)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                data = urllib.request.urlopen(req, timeout=30).read()
                if len(data) < 500:
                    raise ValueError("too small")
                with open(out, "wb") as f:
                    f.write(data)
                return ("ok", out)
            except Exception as e:
                if attempt == 3:
                    return ("fail", f"{url} :: {e}")
                continue
        return ("fail", url)

    ok = skip = fail = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(worker, t) for t in tasks]
        for f in as_completed(futs):
            st, info = f.result()
            if st == "ok":
                ok += 1
            elif st == "skip":
                skip += 1
            else:
                fail += 1
                print("  FAIL", info, file=sys.stderr)
    return ok, skip, fail


def main():
    os.makedirs(TILES_DIR, exist_ok=True)
    os.makedirs(VENDOR_DIR, exist_ok=True)
    all_tasks = []
    summary = []
    for z in ZOOMS:
        x0, x1, y0, y1 = tile_range(z)
        n = (x1 - x0 + 1) * (y1 - y0 + 1)
        summary.append(f"z{z}: x[{x0}..{x1}] y[{y0}..{y1}] = {n} tiles")
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                all_tasks.append((z, x, y))
    print("计划下载：")
    for s in summary:
        print("  ", s)
    print(f"总任务数：{len(all_tasks)}")
    ok, skip, fail = fetch(all_tasks)
    print(f"\n完成：新增 {ok} ，已存在跳过 {skip} ，失败 {fail}")

    # Leaflet
    print("\n下载 Leaflet 库...")
    for name, url in [
        ("leaflet.js", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"),
        ("leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"),
    ]:
        out = os.path.join(VENDOR_DIR, name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=30).read()
            with open(out, "wb") as f:
                f.write(data)
            print(f"  {name} -> {len(data)} bytes")
        except Exception as e:
            print(f"  {name} FAIL: {e}", file=sys.stderr)

    # 校验 tiles 总量
    total = 0
    for dp, _, fns in os.walk(TILES_DIR):
        total += len([f for f in fns if f.endswith(".png")])
    print(f"\n瓦片目录现有 PNG 总数：{total}")


if __name__ == "__main__":
    main()
