#!/usr/bin/env python3
"""生成画像(assets/raw/*.png)の背景を抜いて、ゲームで使うサイズに縮小する。

    <ComfyUIのvenv>/bin/python tools/cutout.py

背景色に近く、かつ画像の縁から繋がっている領域だけを透過させる。
「繋がっている」ことを条件にしているので、白いおむつのようなキャラ内部の
明るい部分は塗り残さずに残る。
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "assets" / "raw"
OUT_DIR = PROJECT_ROOT / "assets"

# 背景とみなす色の許容差(0-255のユークリッド距離)
TOLERANCE = 34

# 黒背景で生成し、輝度をアルファに変換して使うもの（発光する装飾）
EMBLEM_ASSETS = {"logo_emblem"}

TARGET_HEIGHT = {
    "player_idle": 260,
    "player_run": 260,
    "player_attack": 260,
    "player_swing": 260,
    "player_roll": 220,
    "player_guard": 260,
    "boss1": 340,
    "boss1_windup": 340,
    "boss1_attack": 340,
    "boss2": 340,
    "logo_diaper": 200,
}

# ハンマー/弓ベイビーも つるぎベイビー と同じ大きさに揃える
for _prefix in ("hammer", "bow"):
    for _pose, _h in (("idle", 260), ("run", 260), ("attack", 260),
                      ("swing", 260), ("guard", 260), ("roll", 220)):
        TARGET_HEIGHT[f"{_prefix}_{_pose}"] = _h


def cutout(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape

    corners = np.concatenate([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]).reshape(4, 3)
    bg_color = corners.mean(axis=0)

    distance = np.sqrt(((rgb - bg_color) ** 2).sum(axis=2))
    bg_like = distance < TOLERANCE

    # 縁から繋がっている背景領域だけを対象にする
    labels, count = ndimage.label(bg_like)
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border_labels.discard(0)
    background = np.isin(labels, list(border_labels))

    opaque = ~background
    # 明るい背景の縁が1px残ると暗い画面上で白フチに見えるので、少し内側で切る
    opaque = ndimage.binary_erosion(opaque, iterations=1)

    alpha = Image.fromarray((opaque * 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))

    out = img.convert("RGBA")
    out.putalpha(alpha)

    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def process_sprite(name: str, path: Path):
    img = Image.open(path)
    sprite = cutout(img)

    target_h = TARGET_HEIGHT.get(name, 260)
    scale = target_h / sprite.height
    sprite = sprite.resize(
        (max(1, round(sprite.width * scale)), target_h), Image.LANCZOS
    )

    out_path = OUT_DIR / f"{name}.png"
    sprite.save(out_path, optimize=True)
    print(f"[cut] {name}: {sprite.width}x{sprite.height} -> {out_path.stat().st_size // 1024}KB")


def process_background(name: str, path: Path):
    img = Image.open(path).convert("RGB")
    img = img.resize((1280, 720), Image.LANCZOS)
    out_path = OUT_DIR / f"{name}.jpg"
    img.save(out_path, quality=86, optimize=True)
    print(f"[bg ] {name}: 1280x720 -> {out_path.stat().st_size // 1024}KB")


def process_emblem(name: str, path: Path):
    """ロゴの紋章。明るさをそのままアルファにして、黒背景を溶かし込む。

    背景が完全な黒ではないため、単純にscreen合成すると四角い縁が見えてしまう。
    輝度をアルファに変換すれば、光っている金の部分だけが残る。
    """
    img = Image.open(path).convert("RGB")
    scale = 520 / img.width
    img = img.resize((520, round(img.height * scale)), Image.LANCZOS)

    rgb = np.asarray(img).astype(np.float32)
    luma = rgb.max(axis=2) / 255.0
    # 暗部を落としつつ、金の部分はしっかり残す
    alpha = np.clip((luma - 0.06) * 1.9, 0, 1)

    out = img.convert("RGBA")
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))

    out_path = OUT_DIR / f"{name}.png"
    out.save(out_path, optimize=True)
    print(f"[emb] {name}: {out.width}x{out.height} -> {out_path.stat().st_size // 1024}KB")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in sorted(RAW_DIR.glob("*.png")):
        name = path.stem
        if name.startswith("bg_"):
            process_background(name, path)
        elif name in EMBLEM_ASSETS:
            process_emblem(name, path)
        else:
            process_sprite(name, path)


if __name__ == "__main__":
    main()
