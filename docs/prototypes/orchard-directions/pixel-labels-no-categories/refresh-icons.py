"""为本地原型缓存图标；不修改真实扩展数据。Python 标准库即可运行。"""
import concurrent.futures
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
PREFIX = "docs/prototypes/orchard-directions/pixel-labels-no-categories/"
try:
    EXISTING = json.loads((ROOT / "local-icons.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    EXISTING = {"byIcon": {}}


def image_extension(body):
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if body.startswith(b"\x00\x00\x01\x00"):
        return ".ico"
    if body.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if body.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return ".webp"
    try:
        root = ET.fromstring(body)
        if root.tag in ("svg", "{http://www.w3.org/2000/svg}svg"):
            return ".svg"
    except ET.ParseError:
        pass
    # 不保存 HTML 登录页或未知格式。
    return None


def download(site):
    cached = EXISTING.get("byIcon", {}).get(site.get("icon", ""))
    if cached:
        file = ROOT / "icons" / Path(cached).name
        if file.is_file() and image_extension(file.read_bytes()):
            return site, cached
    parsed = urlsplit(site["url"])
    origin_icon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"
    candidates = [site.get("icon", ""), origin_icon]
    for candidate in dict.fromkeys(candidates):
        if not candidate.startswith(("https://", "http://")):
            continue
        try:
            request = Request(candidate, headers={"User-Agent": "Mozilla/5.0", "Accept": "image/*"})
            with urlopen(request, timeout=10) as response:
                body = response.read(2 * 1024 * 1024 + 1)
            extension = image_extension(body)
            if not extension or len(body) > 2 * 1024 * 1024:
                continue
            filename = hashlib.sha256(body).hexdigest()[:24] + extension
            (ROOT / "icons" / filename).write_bytes(body)
            return site, PREFIX + "icons/" + filename
        except Exception:
            continue
    return site, None


if __name__ == "__main__":
    snapshot = json.loads((ROOT.parent / "pixel-labels" / "actual-data.json").read_text(encoding="utf-8-sig"))
    sites = [site for group in snapshot["data"].values() for site in group]
    (ROOT / "icons").mkdir(exist_ok=True)
    mapping = {"byUrl": {}, "byIcon": {}}
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for site, local_path in pool.map(download, sites):
            if local_path:
                mapping["byUrl"][site["url"]] = local_path
                mapping["byIcon"][site.get("icon", "")] = local_path
            else:
                failed.append(site["name"])
    encoded = json.dumps(mapping, ensure_ascii=False, indent=2)
    (ROOT / "local-icons.json").write_text(encoded, encoding="utf-8")
    (ROOT / "local-icons.js").write_text("window.OrchardLocalIcons = " + encoded + ";\n", encoding="utf-8")
    report = {"total": len(sites), "cached": len(sites) - len(failed), "failed": failed}
    (ROOT / "logo-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
