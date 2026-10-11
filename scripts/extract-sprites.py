import sys, json, hashlib
from pathlib import Path
from PIL import Image

LIB = Path("/Users/gecko/locoprowrestling/LoCoProAssetLibrary/characters")
OUT = Path(__file__).resolve().parent.parent / "assets" / "sprites"
SHEETS = {
    "adam-starling": "adam-starling/masters/commissioner-mic-sheet-bor16-transparent-v3.png",
    "anuka-gutierrez": "anuka-gutierrez/masters/microphone-sheet-bor16-transparent-v1.png",
    "carter-cash": "carter-cash/masters/microphone-sheet-bor16-transparent-v1.png",
    "codah-alexander": "codah-alexander/masters/microphone-sheet-bor16-transparent-v1.png",
    "cody-devine": "cody-devine/masters/microphone-sheet-bor16-transparent-v1.png",
    "dean-mercer": "dean-mercer/masters/microphone-sheet-bor16-transparent-v1.png",
    "erza-menagerie-tinker": "erza-menagerie-tinker/masters/microphone-sheet-bor16-transparent-v1.png",
    "franky-gonzales": "franky-gonzales/masters/microphone-sheet-bor16-transparent-v1.png",
    "hussy-steele": "hussy-steele/masters/microphone-sheet-bor16-transparent-v1.png",
    "johnny-crash": "johnny-crash/masters/microphone-sheet-bor16-transparent-v1.png",
    "jt-staten": "jt-staten/masters/microphone-sheet-bor16-transparent-v1.png",
    "major-glory": "major-glory/masters/microphone-sheet-bor16-transparent-v1.png",
    "michael-avalon": "michael-avalon/masters/microphone-sheet-bor16-transparent-v1.png",
    "morgana-lavey": "morgana-lavey/masters/microphone-sheet-bor16-transparent-v1.png",
    "nicky-hyde": "nicky-hyde/masters/final-word-mic-sheet-engine-v1-transparent.png",
    "the-vigilante": "the-vigilante/masters/microphone-sheet-bor16-transparent-v1.png",
    "zeak-gallent": "zeak-gallent/masters/microphone-sheet-bor16-transparent-v1.png",
}
POSES = {"idle": 2, "yes": 16, "no": 12, "shock": 9, "point": 5}
CELL = 256
PAD = 4

def cell(img, i):
    c, r = i % 6, i // 6
    return img.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL))

def main_bbox(im):
    a = im.getchannel("A")
    w, h = a.size
    px = a.load()
    rows = [y for y in range(h) if any(px[x, y] > 0 for x in range(w))]
    # keep the tallest contiguous run of opaque rows so stray drop props below the feet are excluded
    runs, start, prev = [], None, None
    for y in rows:
        if start is None:
            start = prev = y
        elif y == prev + 1:
            prev = y
        else:
            runs.append((start, prev)); start = prev = y
    if start is not None:
        runs.append((start, prev))
    top, bot = max(runs, key=lambda r: r[1] - r[0])
    band = a.crop((0, top, w, bot + 1))
    bx = band.getbbox()
    return (bx[0], top, bx[2], bot + 1)

def is_fringe(px):
    r, g, b, a = px
    return a > 0 and min(r, b) > 55 and g < 0.55 * min(r, b) and abs(r - b) < 90

def defringe(im, passes=3):
    im = im.copy()
    w, h = im.size
    for _ in range(passes):
        px = im.load()
        kill = []
        for y in range(h):
            for x in range(w):
                if not is_fringe(px[x, y]):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] == 0:
                        kill.append((x, y))
                        break
        if not kill:
            break
        for x, y in kill:
            px[x, y] = (0, 0, 0, 0)
    return im

report = {}
for slug, rel in SHEETS.items():
    src = LIB / rel
    sheet = Image.open(src).convert("RGBA")
    if sheet.size != (1536, 1024):
        sys.exit(f"{slug}: unexpected size {sheet.size}")
    cells = {k: cell(sheet, i) for k, i in POSES.items()}
    boxes = [main_bbox(c) for c in cells.values()]
    x0 = max(min(b[0] for b in boxes) - PAD, 0)
    y0 = max(min(b[1] for b in boxes) - PAD, 0)
    x1 = min(max(b[2] for b in boxes) + PAD, CELL)
    y1 = min(max(b[3] for b in boxes) + PAD, CELL)
    for k, c in cells.items():
        out = c.crop((x0, y0, x1, y1))
        # clear any stray pixels outside each pose's own main body box
        bx = main_bbox(c)
        mask = Image.new("L", c.size, 0)
        mask.paste(255, bx)
        clean = Image.new("RGBA", c.size, (0, 0, 0, 0))
        clean.paste(c, (0, 0), mask)
        out = clean.crop((x0, y0, x1, y1))
        out = defringe(out)
        p = OUT / f"{slug}-{k}.png"
        out.save(p, optimize=True)
    report[slug] = {"source": str(src), "sha256": hashlib.sha256(src.read_bytes()).hexdigest(), "frame": [x1 - x0, y1 - y0]}

(OUT / "SOURCES.json").write_text(json.dumps({"poses": POSES, "sheets": report}, indent=2))
print(json.dumps({k: v["frame"] for k, v in report.items()}))
