#!/usr/bin/env python3
"""タイトルロゴを1枚の画像として組み上げる。

文字にHTML要素を重ねる方式だと安っぽくなるので、金の質感・彫り込み・
おむつのイラストまで含めて1枚のPNGに焼き込む。

    <ComfyUIのvenv>/bin/python tools/make_logo.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONT = ROOT / "tools" / "fonts" / "Cinzel.ttf"

W, H = 1800, 1000  # 余白多めに描いて、最後に中身の大きさで切り詰める
SS = 2  # いったん2倍で描いて最後に縮小する（縁を滑らかにするため）
OUT_W = 1400


def load_font(size):
    font = ImageFont.truetype(str(FONT), size)
    try:
        font.set_variation_by_axes([900])  # Black
    except Exception:
        pass
    return font


def draw_tracked(draw, text, font, center_x, top_y, tracking, fill=255):
    """字間を広げて描く。Cinzelは字間を空けたほうが石碑らしくなる。"""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = center_x - total / 2
    boxes = []
    for ch, w in zip(text, widths):
        draw.text((x, top_y), ch, font=font, fill=fill)
        boxes.append((x, x + w))
        x += w + tracking
    return boxes, total


def gold_gradient(size):
    """上から下へ、白金 → 明るい金 → 焦げた銅。"""
    w, h = size
    stops = [
        (0.00, (250, 240, 214)),
        (0.22, (233, 201, 129)),
        (0.46, (176, 132, 58)),
        (0.58, (247, 231, 187)),
        (0.78, (150, 108, 45)),
        (1.00, (86, 58, 24)),
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

    # 金物らしいざらつきを足す
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 7.0, (h, w, 1))
    grad = np.clip(grad + noise, 0, 255)
    return Image.fromarray(grad.astype(np.uint8), "RGB")


def engrave(mask: Image.Image, base: Image.Image) -> Image.Image:
    """マスクの形に金を流し込み、上辺に光・下辺に影を入れて彫り込みに見せる。"""
    layer = base.convert("RGBA")
    layer.putalpha(mask)

    m = np.asarray(mask).astype(np.float32) / 255.0
    up = np.roll(m, 3, axis=0)
    down = np.roll(m, -3, axis=0)
    highlight = np.clip(m - down, 0, 1)  # 上端
    shadow = np.clip(m - up, 0, 1)       # 下端

    hi = Image.fromarray((highlight * 210).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
    sh = Image.fromarray((shadow * 190).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))

    out = layer.copy()
    out.alpha_composite(Image.merge("RGBA", (
        Image.new("L", mask.size, 255), Image.new("L", mask.size, 246),
        Image.new("L", mask.size, 214), hi)))
    out.alpha_composite(Image.merge("RGBA", (
        Image.new("L", mask.size, 26), Image.new("L", mask.size, 18),
        Image.new("L", mask.size, 10), sh)))
    out.putalpha(mask)
    return out


def quad(p0, p1, p2, n=24):
    """2次ベジエを点列に開く。"""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return pts


def make_diaper(width):
    """おむつを図形で描く。生成画像だと『おむつを履いたヒヨコ』等になってしまうため。

    腰まわりが広く、脚ぐりに向かってすぼまり、股が丸い ―― という
    輪郭を作らないと、ただの器や眼鏡に見えてしまう。
    """
    vw, vh = 200.0, 118.0
    k = width / vw
    img = Image.new("RGBA", (int(vw * k), int(vh * k) + 6), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    S = lambda p: (p[0] * k, p[1] * k)

    outline = [(10, 8)]
    outline += quad((10, 8), (100, 0), (190, 8))
    outline += [(186, 30)]
    # 脚ぐりは内側にえぐる。ここが凸だと器にしか見えない
    outline += quad((186, 30), (156, 62), (128, 96))
    outline += quad((128, 96), (100, 112), (72, 96))   # 股
    outline += quad((72, 96), (44, 62), (14, 30))
    body = [S(p) for p in outline]
    d.polygon(body, fill=(252, 253, 255, 255))

    # 腰のギャザーとテープ
    band = quad((10, 8), (100, 0), (190, 8)) + [(188, 26)] + list(reversed(quad((12, 26), (100, 17), (188, 26))))
    d.polygon([S(p) for p in band], fill=(228, 237, 251, 255))
    for x0 in (26, 136):
        d.rounded_rectangle([S((x0, 7)), S((x0 + 38, 20))], radius=6 * k, fill=(176, 208, 244, 255))

    # 股まわりのしわ
    for pts in (((58, 54), (68, 84), (92, 96)), ((142, 54), (132, 84), (108, 96))):
        d.line([S(p) for p in quad(*pts)], fill=(222, 232, 247, 255), width=max(2, int(2.6 * k)))

    # 下側にやわらかい影を入れて丸みを出す
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).polygon(body, fill=(118, 138, 175, 105))
    shade = shade.filter(ImageFilter.GaussianBlur(int(7 * k)))
    lit = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lit).polygon([(px, py - 13 * k) for px, py in body], fill=(255, 255, 255, 255))
    img.alpha_composite(Image.composite(shade, Image.new("RGBA", img.size, (0, 0, 0, 0)),
                                        ImageChops.subtract(img.getchannel("A"), lit.getchannel("A"))))

    # 輪郭。金の上に白を置くだけだと絵として弱い
    d.line(body + [body[0]], fill=(112, 124, 152, 235), width=max(2, int(2.4 * k)), joint="curve")
    return img


def main():
    w, h = W * SS, H * SS
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    # 背後の紋章をうっすら敷く
    emblem_path = ASSETS / "logo_emblem.png"
    if emblem_path.exists():
        em = Image.open(emblem_path).convert("RGBA")
        scale = (h * 0.55) / em.height
        em = em.resize((round(em.width * scale), round(em.height * scale)), Image.LANCZOS)
        faded = em.copy()
        faded.putalpha(em.getchannel("A").point(lambda v: int(v * 0.12)))
        canvas.alpha_composite(faded, ((w - em.width) // 2, (h - em.height) // 2))

    # 文字のマスクを作る
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    f_top = load_font(int(200 * SS))
    f_bottom = load_font(int(200 * SS))
    top_y = int(120 * SS)
    bottom_y = int(388 * SS)
    boxes, _ = draw_tracked(md, "BABYDEN", f_top, w / 2, top_y, int(16 * SS))
    draw_tracked(md, "RING", f_bottom, w / 2, bottom_y, int(54 * SS))
    # 文字の実際の上端。おむつの位置合わせに使う
    cap_top = md.textbbox((0, top_y), "B", font=f_top)[1]
    cap_bottom = md.textbbox((0, top_y), "B", font=f_top)[3]

    text = engrave(mask, gold_gradient((w, h)))

    # 外側のにじむ光と、その下の落ち影
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow.paste((255, 206, 120, 255), (0, 0), mask.filter(ImageFilter.GaussianBlur(18 * SS)))
    glow.putalpha(glow.getchannel("A").point(lambda v: int(v * 0.45)))
    drop = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop.paste((0, 0, 0, 255), (0, int(6 * SS)), mask.filter(ImageFilter.GaussianBlur(6 * SS)))
    drop.putalpha(drop.getchannel("A").point(lambda v: int(v * 0.75)))

    canvas.alpha_composite(glow)
    canvas.alpha_composite(drop)
    canvas.alpha_composite(text)

    # BABY の4文字におむつを履かせる（このゲームの一番の見せ所）
    diaper_box = None
    if boxes:
        left = boxes[0][0]
        right = boxes[3][1]
        dp = make_diaper((right - left) * 0.46)
        x = int(left + (right - left) / 2 - dp.width / 2)
        # 文字の下側 4割 にかぶせる
        y = int(cap_bottom - (cap_bottom - cap_top) * 0.60)
        shadow = Image.new("RGBA", dp.size, (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 255), (0, 0), dp.getchannel("A"))
        shadow = shadow.filter(ImageFilter.GaussianBlur(7 * SS))
        shadow.putalpha(shadow.getchannel("A").point(lambda v: int(v * 0.8)))
        canvas.alpha_composite(shadow, (x, y + int(8 * SS)))
        canvas.alpha_composite(dp, (x, y))
        diaper_box = (x, y, x + dp.width, y + dp.height)

    # 切り詰めは文字（とおむつ）を基準にする。背後の紋章は薄いので数えない
    bbox = mask.getbbox()
    if diaper_box:
        bbox = (min(bbox[0], diaper_box[0]), min(bbox[1], diaper_box[1]),
                max(bbox[2], diaper_box[2]), max(bbox[3], diaper_box[3]))
    pad = int(40 * SS)
    canvas = canvas.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                          min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
    out = canvas.resize((OUT_W, round(canvas.height * OUT_W / canvas.width)), Image.LANCZOS)
    out_path = ASSETS / "logo_title.png"
    out.save(out_path, optimize=True)
    print(f"[logo] {out.width}x{out.height} -> {out_path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
