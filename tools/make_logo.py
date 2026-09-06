#!/usr/bin/env python3
"""タイトルロゴを書体と図形から1枚に焼き上げる。

生成画像やHTML上での重ね合わせではなく、
  ・環状の紋章（中心におしゃぶりのシルエットを忍ばせる）
  ・彫り込んだ金の文字
を同じ金の質感で描いて1枚のPNGにする。

    <ComfyUIのvenv>/bin/python tools/make_logo.py
"""

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONT = ROOT / "tools" / "fonts" / "Cinzel.ttf"

SS = 3            # 3倍で描いて最後に縮小する
OUT_W = 1400      # 書き出し幅
W, H = 1500, 1150  # 作業キャンバス（最後に中身で切り詰める）

WORD = "BABYDEN RING"
TAGLINE = "AGE OF THE CRIB"


def load_font(size, weight=900):
    font = ImageFont.truetype(str(FONT), size)
    try:
        font.set_variation_by_axes([weight])
    except Exception:
        pass
    return font


# --------------------------------------------------------------- 金の質感

def gold_gradient(size):
    """上から下へ、白金 → 明るい金 → 焦げた銅。"""
    w, h = size
    stops = [
        (0.00, (252, 244, 222)),
        (0.20, (236, 206, 137)),
        (0.44, (178, 134, 58)),
        (0.56, (250, 235, 194)),
        (0.76, (152, 110, 46)),
        (1.00, (84, 57, 24)),
    ]
    ys = np.linspace(0, 1, h)
    cols = np.zeros((h, 3), dtype=np.float32)
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (ys >= p0) & (ys <= p1)
        t = ((ys[m] - p0) / (p1 - p0))[:, None]
        cols[m] = np.array(c0) * (1 - t) + np.array(c1) * t
    grad = np.repeat(cols[:, None, :], w, axis=1)
    # 金物らしいざらつき
    rng = np.random.default_rng(11)
    grad = np.clip(grad + rng.normal(0, 6.5, (h, w, 1)), 0, 255)
    return Image.fromarray(grad.astype(np.uint8), "RGB")


def engrave(mask: Image.Image, base: Image.Image, depth: int) -> Image.Image:
    """マスクの形に金を流し込み、上辺に光・下辺に影を置いて彫りに見せる。"""
    layer = base.convert("RGBA")
    layer.putalpha(mask)

    m = np.asarray(mask).astype(np.float32) / 255.0
    highlight = np.clip(m - np.roll(m, -depth, axis=0), 0, 1)
    shadow = np.clip(m - np.roll(m, depth, axis=0), 0, 1)

    blur = max(1, depth // 2)
    hi = Image.fromarray((highlight * 205).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    sh = Image.fromarray((shadow * 185).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))

    out = layer.copy()
    flat = lambda v: Image.new("L", mask.size, v)
    out.alpha_composite(Image.merge("RGBA", (flat(255), flat(247), flat(216), hi)))
    out.alpha_composite(Image.merge("RGBA", (flat(24), flat(17), flat(9), sh)))
    out.putalpha(mask)
    return out


# --------------------------------------------------------------- 図形

def ellipse_points(cx, cy, rx, ry, rot, a0, a1, n=160):
    """回転させた楕円の弧を点列で返す。"""
    pts = []
    c, s = math.cos(rot), math.sin(rot)
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def draw_pacifier(d, cx, cy, r, w):
    """おしゃぶりのシルエット。紋章の中心に置く。

    軌道線に埋もれると何の形か分からなくなるので、太めの線ではっきり描く。
    """
    # 持ち手のリング
    d.ellipse([cx - r * 0.42, cy - r * 1.08, cx + r * 0.42, cy - r * 0.34], outline=255, width=w)
    # リングと盾をつなぐ首
    d.line([(cx - r * 0.13, cy - r * 0.42), (cx - r * 0.13, cy - r * 0.66)], fill=255, width=w)
    d.line([(cx + r * 0.13, cy - r * 0.42), (cx + r * 0.13, cy - r * 0.66)], fill=255, width=w)
    # 口当ての盾
    d.ellipse([cx - r * 1.00, cy - r * 0.40, cx + r * 1.00, cy + r * 0.30], outline=255, width=w)
    # 乳首
    d.ellipse([cx - r * 0.32, cy + r * 0.22, cx + r * 0.32, cy + r * 1.02], outline=255, width=w)


def draw_emblem(mask, cx, cy, R):
    """環状の紋章。割れた外環・内環・交差する軌道・刻み目で組む。"""
    d = ImageDraw.Draw(mask)
    thin = max(2, int(R * 0.012))
    med = max(3, int(R * 0.020))

    # 外環（真上に切れ目を入れる）
    d.arc([cx - R, cy - R, cx + R, cy + R], start=-72, end=252, fill=255, width=med)
    # 内環
    r2 = R * 0.855
    d.arc([cx - r2, cy - r2, cx + r2, cy + r2], start=-250, end=70, fill=255, width=thin)

    # 二つの環のあいだに刻み目を並べる
    for i in range(36):
        a = math.radians(i * 10 - 90)
        long_tick = i % 3 == 0
        r_in = R * (0.875 if long_tick else 0.915)
        d.line([(cx + math.cos(a) * r_in, cy + math.sin(a) * r_in),
                (cx + math.cos(a) * R * 0.985, cy + math.sin(a) * R * 0.985)],
               fill=255, width=thin if long_tick else max(1, thin - 1))

    # 交差する軌道。3枚の細長い楕円を回して編み目のように見せる
    for k in range(3):
        rot = math.radians(60 * k + 30)
        d.line(ellipse_points(cx, cy, R * 0.80, R * 0.30, rot, 0, math.tau),
               fill=255, width=thin, joint="curve")

    # 上部の切れ目に置く尖塔の飾り
    tip = cy - R * 1.22
    d.polygon([(cx, tip), (cx + R * 0.075, cy - R * 1.03),
               (cx, cy - R * 0.84), (cx - R * 0.075, cy - R * 1.03)], fill=255)

    # 中心のおしゃぶり。軌道線を丸く抜いてから描き、形が読めるようにする
    pr = R * 0.40
    d.ellipse([cx - pr * 1.32, cy - pr * 1.32, cx + pr * 1.32, cy + pr * 1.32], fill=0)
    d.ellipse([cx - pr * 1.32, cy - pr * 1.32, cx + pr * 1.32, cy + pr * 1.32],
              outline=255, width=max(1, thin - 1))
    draw_pacifier(d, cx, cy, pr, med)

    # 紋章から下へ伸びる縦の芯。文字とつなぐ
    d.line([(cx, cy + R * 0.86), (cx, cy + R * 1.18)], fill=255, width=med)


def draw_rule(mask, cx, y, half, thickness):
    """両端が細く消える金の罫線。"""
    d = ImageDraw.Draw(mask)
    n = 240
    for i in range(n):
        t = i / (n - 1)
        x0 = cx - half + half * 2 * t
        x1 = cx - half + half * 2 * (i + 1) / (n - 1)
        fade = math.sin(math.pi * t) ** 0.55
        d.rectangle([x0, y, x1, y + thickness], fill=int(255 * fade))
    # 中央に菱形の飾り
    s = thickness * 3.2
    d.polygon([(cx, y + thickness / 2 - s), (cx + s, y + thickness / 2),
               (cx, y + thickness / 2 + s), (cx - s, y + thickness / 2)], fill=255)


def draw_tracked(draw, text, font, cx, top, tracking, word_gap):
    widths = []
    for ch in text:
        widths.append(word_gap if ch == " " else draw.textlength(ch, font=font))
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        if ch != " ":
            draw.text((x, top), ch, font=font, fill=255)
        x += w + tracking
    return total


# --------------------------------------------------------------- 組み立て

def main():
    w, h = W * SS, H * SS
    cx = w / 2

    emblem_mask = Image.new("L", (w, h), 0)
    R = int(200 * SS)
    emblem_cy = int(270 * SS)
    draw_emblem(emblem_mask, cx, emblem_cy, R)

    text_mask = Image.new("L", (w, h), 0)
    td = ImageDraw.Draw(text_mask)

    f_word = load_font(int(150 * SS), 900)
    word_top = int(506 * SS)
    word_w = draw_tracked(td, WORD, f_word, cx, word_top, int(11 * SS), int(46 * SS))

    # 文字の実寸を測って、罫線と副題の位置を決める
    bbox = td.textbbox((0, word_top), "B", font=f_word)
    cap_top, cap_bottom = bbox[1], bbox[3]
    half = word_w / 2 + int(18 * SS)
    draw_rule(text_mask, cx, cap_top - int(34 * SS), half, max(2, int(2.6 * SS)))
    draw_rule(text_mask, cx, cap_bottom + int(26 * SS), half, max(2, int(2.6 * SS)))

    f_tag = load_font(int(40 * SS), 500)
    draw_tracked(td, TAGLINE, f_tag, cx, cap_bottom + int(56 * SS), int(16 * SS), int(30 * SS))

    base = gold_gradient((w, h))
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    # 外側のにじむ光 → 落ち影 → 本体、の順に重ねる
    both = Image.new("L", (w, h), 0)
    both.paste(emblem_mask, (0, 0), emblem_mask)
    both.paste(text_mask, (0, 0), text_mask)

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow.paste((255, 202, 116, 255), (0, 0), both.filter(ImageFilter.GaussianBlur(20 * SS)))
    glow.putalpha(glow.getchannel("A").point(lambda v: int(v * 0.5)))
    canvas.alpha_composite(glow)

    drop = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop.paste((0, 0, 0, 255), (0, int(5 * SS)), both.filter(ImageFilter.GaussianBlur(5 * SS)))
    drop.putalpha(drop.getchannel("A").point(lambda v: int(v * 0.78)))
    canvas.alpha_composite(drop)

    # 紋章は文字よりわずかに引かせて、主役を文字にする
    emblem = engrave(emblem_mask, base, int(3 * SS))
    emblem.putalpha(emblem.getchannel("A").point(lambda v: int(v * 0.92)))
    canvas.alpha_composite(emblem)
    canvas.alpha_composite(engrave(text_mask, base, int(5 * SS)))

    bbox = both.getbbox()
    pad = int(30 * SS)
    canvas = canvas.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                          min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
    out = canvas.resize((OUT_W, round(canvas.height * OUT_W / canvas.width)), Image.LANCZOS)
    out_path = ASSETS / "logo_title.png"
    out.save(out_path, optimize=True)
    print(f"[logo] {out.width}x{out.height} -> {out_path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
