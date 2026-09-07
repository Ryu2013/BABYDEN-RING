#!/usr/bin/env python3
"""複数のモーションが並んだ1枚絵を、背景を抜いて1体ずつに切り分ける。

    <ComfyUIのvenv>/bin/python tools/split_sheet.py <画像> --out assets/raw --prefix boss1_windup
    # 名前を指定して割り当てる（左から順）
    ... --names thrust spin stomp
    # 等間隔に並んでいるなら格子で割る
    ... --grid 4x2

自動分割は「背景を抜いたあと、繋がっている塊」を1体とみなす。
剣や武器が体から離れて描かれている場合は --merge を大きくすると1体にまとまる。
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

# 背景とみなす色の許容差(0-255のユークリッド距離)
TOLERANCE = 34


def background_mask(img: Image.Image, tolerance: int) -> np.ndarray:
    """画像の縁から繋がっている、背景色に近い領域を True で返す。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    corners = np.concatenate([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]).reshape(4, 3)
    bg_color = corners.mean(axis=0)

    distance = np.sqrt(((rgb - bg_color) ** 2).sum(axis=2))
    bg_like = distance < tolerance

    labels, _ = ndimage.label(bg_like)
    border = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    return np.isin(labels, list(border))


def to_rgba(img: Image.Image, opaque: np.ndarray, feather: float = 0.8) -> Image.Image:
    alpha = Image.fromarray((opaque * 255).astype(np.uint8))
    if feather:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def split_auto(img: Image.Image, opaque: np.ndarray, merge: int, min_area: int):
    """繋がっている塊ごとに切り出す。武器などが離れていても merge で束ねる。"""
    grouped = ndimage.binary_dilation(opaque, iterations=merge) if merge else opaque
    labels, count = ndimage.label(grouped)

    boxes = []
    for i in range(1, count + 1):
        ys, xs = np.nonzero((labels == i) & opaque)
        if len(xs) < min_area:
            continue
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    # 左から右、上から下の順に並べる（行がずれていても読みやすい順になる）
    if boxes:
        heights = [b[3] - b[1] for b in boxes]
        row_h = max(heights) * 0.6
        boxes.sort(key=lambda b: (int(b[1] // row_h), b[0]))
    return boxes


def split_grid(img: Image.Image, cols: int, rows: int):
    w, h = img.size
    cw, ch = w // cols, h // rows
    return [(c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            for r in range(rows) for c in range(cols)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", default="assets/raw")
    ap.add_argument("--prefix", default="sheet")
    ap.add_argument("--names", nargs="*", help="左から順に割り当てる名前")
    ap.add_argument("--grid", help="等間隔なら COLSxROWS （例: 4x2）")
    ap.add_argument("--tolerance", type=int, default=TOLERANCE, help="背景とみなす色の許容差")
    ap.add_argument("--merge", type=int, default=6, help="離れた部品を同じ1体にまとめる強さ")
    ap.add_argument("--min-area", type=int, default=1500, help="これより小さい塊は無視する")
    ap.add_argument("--pad", type=int, default=4)
    args = ap.parse_args()

    img = Image.open(args.image)
    bg = background_mask(img, args.tolerance)
    opaque = ndimage.binary_erosion(~bg, iterations=1)
    rgba = to_rgba(img, opaque)

    if args.grid:
        cols, rows = (int(v) for v in args.grid.lower().split("x"))
        boxes = split_grid(img, cols, rows)
    else:
        boxes = split_auto(img, opaque, args.merge, args.min_area)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"{len(boxes)} 個に分割")

    for i, (x0, y0, x1, y1) in enumerate(boxes):
        piece = rgba.crop((max(0, x0 - args.pad), max(0, y0 - args.pad),
                           min(rgba.width, x1 + args.pad), min(rgba.height, y1 + args.pad)))
        bbox = piece.getbbox()
        if bbox:
            piece = piece.crop(bbox)
        if args.names and i < len(args.names):
            name = f"{args.prefix}_{args.names[i]}" if args.prefix else args.names[i]
        else:
            name = f"{args.prefix}_{i + 1:02d}"
        path = out_dir / f"{name}.png"
        piece.save(path, optimize=True)
        print(f"  [{i + 1:2d}] {path.name}: {piece.width}x{piece.height}")


if __name__ == "__main__":
    main()
