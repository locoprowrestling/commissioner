"""Extract COMMISSIONER card sprites from the original microphone sheets.

Flood extraction, never a grid cut (see
/Users/gecko/locoprowrestling/.knowledgebase/projects/LoCoProGenFactory/animations/sprite-grounding-depth-and-visual-qa.md):
every opaque pixel on the full sheet is labeled into 8-connected components.
Each sheet cell's figure is its largest component, taken whole even when it
crosses a cell line. Every smaller island (sparks, sweat, loose hair) belongs
to the figure it sits closest to, and is kept only when that figure is the
requested pose, the gap is small, it does not sit below the feet, and it does
not float more than a few pixels above the head. Those excluded islands are
generator debris (floating boot soles, severed hands with mics under the
feet); they are reported in SOURCES.json and dropped.

Magenta key bleed on the outline is darkened to the outline color, not
deleted, so no silhouette pixel is ever removed.
"""
import sys, json, hashlib
from collections import deque
from pathlib import Path
from PIL import Image

ROSTER = Path("/Users/gecko/locoprowrestling/newfightgame/generated-art/characters/production/microphone-roster")
OUT = Path(__file__).resolve().parent.parent / "assets" / "sprites"
# Un-normalized original sheets. The LoCoProAssetLibrary mic masters are the
# grid-normalized engine copies (normalize-strict-mic-sheet.sh crops every
# 256px cell), so they carry grid cuts and must not be used here.
SHEETS = {
    "adam-starling": Path("/Users/gecko/locoprowrestling/newfightgame/generated-art/characters/production/adam-starling-commissioner-mic-sheet-bor16-transparent-v3-2026-07-11.png"),
    "anuka-gutierrez": ROSTER / "tas-anuka-gutierrez-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "carter-cash": ROSTER / "tas-carter-cash-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "codah-alexander": ROSTER / "tas-codah-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "cody-devine": ROSTER / "tas-cody-devine-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "dean-mercer": ROSTER / "tas-dean-mercer-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "erza-menagerie-tinker": ROSTER / "tas-erza-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "franky-gonzales": ROSTER / "tas-franky-gonzales-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "hussy-steele": ROSTER / "tas-hussy-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "johnny-crash": ROSTER / "tas-johnny-crash-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "jt-staten": ROSTER / "tas-jt-staten-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "major-glory": ROSTER / "tas-major-glory-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "michael-avalon": ROSTER / "tas-avalon-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "morgana-lavey": ROSTER / "tas-morgana-lavey-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "the-vigilante": ROSTER / "tas-vigilante-oai-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "zeak-gallent": ROSTER / "tas-zeak-gallent-mic-sheet-bor16-transparent-v1-2026-07-12.png",
    "nicky-hyde": Path("/Users/gecko/locoprowrestling/LoCoProAssetLibrary/characters/nicky-hyde/masters/final-word-mic-sheet-transparent.png"),
}
POSES = {"idle": 2, "yes": 16, "no": 12, "shock": 9, "point": 5}
CELL, COLS, ROWS = 256, 6, 4
PAD = 4
MIN_FIGURE = 1000
MAX_ISLAND_GAP = 12
MAX_ABOVE_GAP = 4
OUTLINE = (24, 0, 28)


def components(im):
    a = im.getchannel("A")
    W, H = a.size
    px = a.load()
    lab = [[-1] * W for _ in range(H)]
    comps = []
    for y in range(H):
        for x in range(W):
            if px[x, y] == 0 or lab[y][x] != -1:
                continue
            cid = len(comps)
            lab[y][x] = cid
            q = deque([(x, y)])
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and lab[ny][nx] == -1 and px[nx, ny] > 0:
                            lab[ny][nx] = cid
                            q.append((nx, ny))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            comps.append({"pts": pts, "box": (min(xs), min(ys), max(xs) + 1, max(ys) + 1)})
    return comps


def gap(a, b):
    dx = max(b[0] - a[2], a[0] - b[2], 0)
    dy = max(b[1] - a[3], a[1] - b[3], 0)
    return max(dx, dy)


def figures(comps):
    figs = {}
    for i in range(COLS * ROWS):
        c, r = i % COLS, i // COLS
        x0, y0 = c * CELL, r * CELL
        best, best_in = None, 0
        for k, comp in enumerate(comps):
            b = comp["box"]
            if b[2] <= x0 or b[0] >= x0 + CELL or b[3] <= y0 or b[1] >= y0 + CELL:
                continue
            inside = sum(1 for (x, y) in comp["pts"] if x0 <= x < x0 + CELL and y0 <= y < y0 + CELL)
            if inside > best_in:
                best, best_in = k, inside
        if best is not None and len(comps[best]["pts"]) >= MIN_FIGURE:
            figs[i] = best
    return figs


def is_key_bleed(p):
    # near-edge despill test from sprite-grounding-depth-and-visual-qa.md
    r, g, b, a = p
    lo = min(r, b)
    return a > 0 and g <= 70 and lo >= 56 and abs(r - b) <= 90 and g < 0.55 * lo


def darken_bleed(im, reach=2):
    px = im.load()
    W, H = im.size
    hits = []
    for y in range(H):
        for x in range(W):
            if not is_key_bleed(px[x, y]):
                continue
            near = False
            for dy in range(-reach, reach + 1):
                for dx in range(-reach, reach + 1):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= W or ny >= H or px[nx, ny][3] == 0:
                        near = True
                        break
                if near:
                    break
            if near:
                hits.append((x, y))
    for x, y in hits:
        px[x, y] = OUTLINE + (255,)
    return len(hits)


def main():
    report, dropped = {}, {}
    for slug, rel in SHEETS.items():
        src = rel
        sheet = Image.open(src).convert("RGBA")
        if sheet.size != (COLS * CELL, ROWS * CELL):
            sys.exit(f"{slug}: unexpected size {sheet.size}")
        comps = components(sheet)
        figs = figures(comps)
        fig_ids = set(figs.values())
        owner = {}
        for k, comp in enumerate(comps):
            if k in fig_ids:
                continue
            cell_i, g = min(((i, gap(comp["box"], comps[f]["box"])) for i, f in figs.items()), key=lambda t: t[1])
            owner[k] = (cell_i, g)
        poses = {}
        for pose, i in POSES.items():
            if i not in figs:
                sys.exit(f"{slug}: no figure found for pose {pose} (cell {i})")
            fb = comps[figs[i]]["box"]
            keep, lost = [figs[i]], []
            for k, (ci, g) in owner.items():
                if ci != i:
                    continue
                b = comps[k]["box"]
                below = b[1] >= fb[3]
                above = b[3] <= fb[1] and g > MAX_ABOVE_GAP
                if below or above or g > MAX_ISLAND_GAP:
                    lost.append((len(comps[k]["pts"]), g))
                else:
                    keep.append(k)
            if lost:
                dropped[f"{slug}-{pose}"] = lost
            pts = [p for k in keep for p in comps[k]["pts"]]
            c, r = i % COLS, i // COLS
            poses[pose] = (pts, c * CELL, r * CELL)
        x0 = min(min(p[0] - ox for p in pts) for pts, ox, oy in poses.values()) - PAD
        y0 = min(min(p[1] - oy for p in pts) for pts, ox, oy in poses.values()) - PAD
        x1 = max(max(p[0] - ox for p in pts) for pts, ox, oy in poses.values()) + 1 + PAD
        y1 = max(max(p[1] - oy for p in pts) for pts, ox, oy in poses.values()) + 1 + PAD
        spx = sheet.load()
        darkened = 0
        for pose, (pts, ox, oy) in poses.items():
            out = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
            opx = out.load()
            for (x, y) in pts:
                opx[x - ox - x0, y - oy - y0] = spx[x, y]
            darkened += darken_bleed(out)
            out.save(OUT / f"{slug}-{pose}.png", optimize=True)
        report[slug] = {
            "source": str(src),
            "sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
            "frame": [x1 - x0, y1 - y0],
            "outlinePixelsDarkened": darkened,
        }
    (OUT / "SOURCES.json").write_text(json.dumps({
        "method": "full-sheet 8-connected flood extraction; islands within %dpx beside their figure kept, none below the feet, none more than %dpx above the head; key-magenta outline darkened, never deleted" % (MAX_ISLAND_GAP, MAX_ABOVE_GAP),
        "poses": POSES,
        "sheets": report,
        "droppedIslands": dropped,
    }, indent=2))
    print(json.dumps({k: v["frame"] for k, v in report.items()}))
    print("dropped islands (px, gap):", json.dumps(dropped))


if __name__ == "__main__":
    main()
