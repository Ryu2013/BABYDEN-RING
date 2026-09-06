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
    "logo_diaper": 200,
}

# ポーズごとに切り抜き後の高さを揃えてしまうと、武器を振り上げた絵だけ
# 体が小さく見える。そこで「元画像の中で被写体が占める縦の割合」を保ったまま
# グループ単位で同じ倍率をかけ、基準ポーズが基準の高さになるようにする。
#   グループ名: (基準ポーズ, 基準ポーズの出力高さ)
SCALE_GROUPS = {
    "player": ("player_idle", 260),
    "hammer": ("hammer_idle", 260),
    "bow": ("bow_idle", 260),
    "boss1": ("boss1", 340),
    "boss1b": ("boss1b", 380),
}
GROUP_MEMBERS = {
    "player": ["player_idle", "player_run", "player_attack", "player_swing",
               "player_guard", "player_roll", "player_charge2", "player_charge3"],
    "hammer": ["hammer_idle", "hammer_run", "hammer_attack", "hammer_swing",
               "hammer_guard", "hammer_roll", "hammer_charge2", "hammer_charge3"],
    "bow": ["bow_idle", "bow_run", "bow_attack", "bow_swing",
            "bow_guard", "bow_roll", "bow_charge2", "bow_charge3"],
    "boss1": ["boss1", "boss1_attack", "boss1_windup"]
             + [f"boss1_windup_{k}" for k in ("overhead", "throw", "low", "dash", "scream")],
    "boss1b": ["boss1b", "boss1b_attack"]
              + [f"boss1b_windup_{k}" for k in ("overhead", "throw", "low", "dash", "scream")],
}
GROUP_OF = {name: g for g, names in GROUP_MEMBERS.items() for name in names}
# 転がりだけは正方形で生成しているので占有率をそのまま使えない。固定の高さにする
FIXED_IN_GROUP = {"player_roll": 210, "hammer_roll": 210, "bow_roll": 210}
# ボス2は単独なので従来どおり固定の高さで出す
TARGET_HEIGHT["boss2"] = 340


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


def _save_sprite(name: str, sprite: Image.Image, target_h: int):
    scale = target_h / sprite.height
    sprite = sprite.resize((max(1, round(sprite.width * scale)), target_h), Image.LANCZOS)
    out_path = OUT_DIR / f"{name}.png"
    sprite.save(out_path, optimize=True)
    print(f"[cut] {name}: {sprite.width}x{sprite.height} -> {out_path.stat().st_size // 1024}KB")


def process_sprite(name: str, path: Path):
    """グループに属さない単発のスプライト。従来どおり固定の高さに揃える。"""
    img = Image.open(path)
    _save_sprite(name, cutout(img), TARGET_HEIGHT.get(name, 260))


def process_group(group: str, paths: dict):
    """同じキャラのポーズ違いを、元画像内での占有率を保ったまま同じ倍率で書き出す。

    ポーズごとに切り抜き後の高さを揃えると、武器を大きく振った絵ほど
    体が小さく描かれてしまう。占有率で揃えれば体の大きさが一定に見える。
    """
    ref_name, ref_h = SCALE_GROUPS[group]
    cut = {}
    frac = {}
    for name, path in paths.items():
        img = Image.open(path)
        sprite = cutout(img)
        cut[name] = sprite
        frac[name] = sprite.height / img.height

    if ref_name not in frac:
        # 基準ポーズが無ければ、そのグループで一番縦に小さいものを基準にする
        ref_name = min(frac, key=frac.get)
    k = ref_h / frac[ref_name]

    for name, sprite in cut.items():
        if name in FIXED_IN_GROUP:
            _save_sprite(name, sprite, FIXED_IN_GROUP[name])
        else:
            _save_sprite(name, sprite, max(1, round(frac[name] * k)))


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
    groups = {g: {} for g in SCALE_GROUPS}
    singles = []

    for path in sorted(RAW_DIR.glob("*.png")):
        name = path.stem
        if name in EMBLEM_ASSETS:
            process_emblem(name, path)
        elif name.startswith("bg_"):
            process_background(name, path)
        elif name in GROUP_OF:
            groups[GROUP_OF[name]][name] = path
        else:
            singles.append((name, path))

    for group, paths in groups.items():
        if paths:
            process_group(group, paths)
    for name, path in singles:
        process_sprite(name, path)


if __name__ == "__main__":
    main()
