#!/usr/bin/env python3
"""第二形態のスプライトを、第一形態の絵から作る。

生成に任せると別の怪物になってしまい「同じ人形が変質した」ように見えない。
第一形態の絵を炭化させ、割れ目から赤い光を漏らすことで、
同一個体の変わり果てた姿として読ませる。

    <ComfyUIのvenv>/bin/python tools/make_phase2.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

SOURCES = ["boss1", "boss1_attack", "boss1_exhausted"] + [
    f"boss1_windup_{k}" for k in ("overhead", "throw", "low", "dash", "scream",
                                  "thrust", "spin", "stomp", "rain", "charge", "roll")
]
# 第二形態は一回り大きい
SCALE = 1.12


def charred(img: Image.Image) -> Image.Image:
    """白磁の人形を、煤けた黒い体に置き換える。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    luma = rgb.mean(axis=2)

    # 明るいところほど灰、暗いところは黒に落とす。青寄りの冷たい炭色
    body = np.stack([
        0.10 + luma * 0.34,
        0.09 + luma * 0.30,
        0.11 + luma * 0.33,
    ], axis=2)
    # 元の陰影を残すため、わずかに元色を混ぜる
    body = body * 0.85 + rgb * 0.15
    return Image.fromarray(np.clip(body * 255, 0, 255).astype(np.uint8), "RGB")


def crack_layer(alpha: Image.Image, seed: int) -> Image.Image:
    """体の上を走る割れ目。枝分かれする折れ線で描く。"""
    w, h = alpha.size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    rng = np.random.default_rng(seed)

    mask = np.asarray(alpha) > 40
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return Image.new("RGBA", (w, h), (0, 0, 0, 0))

    for _ in range(14):
        i = rng.integers(0, len(xs))
        x, y = float(xs[i]), float(ys[i])
        angle = rng.uniform(0, np.pi * 2)
        width = int(rng.integers(2, 5))
        for _ in range(int(rng.integers(4, 9))):
            angle += rng.uniform(-0.9, 0.9)
            step = rng.uniform(w * 0.03, w * 0.09)
            nx, ny = x + np.cos(angle) * step, y + np.sin(angle) * step
            d.line([(x, y), (nx, ny)], fill=255, width=width)
            x, y = nx, ny
            width = max(1, width - 1)

    layer = Image.composite(layer, Image.new("L", (w, h), 0), alpha.point(lambda v: 255 if v > 60 else 0))
    glow = layer.filter(ImageFilter.GaussianBlur(w * 0.012))

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste((255, 60, 30, 255), (0, 0), glow.point(lambda v: int(v * 0.75)))
    out.paste((255, 210, 150, 255), (0, 0), layer)
    return out


def rim_light(alpha: Image.Image) -> Image.Image:
    """輪郭に赤い光を回して、暗い体が背景に溶けないようにする。"""
    w, h = alpha.size
    blurred = alpha.filter(ImageFilter.GaussianBlur(w * 0.02))
    a = np.asarray(blurred).astype(np.float32)
    core = np.asarray(alpha).astype(np.float32)
    edge = np.clip(a - core, 0, 255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste((255, 70, 40, 255), (0, 0), Image.fromarray((edge * 0.9).astype(np.uint8)))
    return out


def build(name: str):
    src = ASSETS / f"{name}.png"
    if not src.exists():
        print(f"[skip] {name}")
        return
    img = Image.open(src).convert("RGBA")
    w, h = int(img.width * SCALE), int(img.height * SCALE)
    img = img.resize((w, h), Image.LANCZOS)
    alpha = img.getchannel("A")

    body = charred(img)
    body.putalpha(alpha)

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(rim_light(alpha))
    out.alpha_composite(body)
    out.alpha_composite(crack_layer(alpha, seed=abs(hash(name)) % 10000))

    out_name = name.replace("boss1", "boss1b", 1)
    out_path = ASSETS / f"{out_name}.png"
    out.save(out_path, optimize=True)
    print(f"[ph2] {out_name}: {w}x{h} -> {out_path.stat().st_size // 1024}KB")


def main():
    for name in SOURCES:
        build(name)
    # 待機ポーズは windup を持たないので、素の boss1 から作ったものを流用する
    print("done")


if __name__ == "__main__":
    main()
