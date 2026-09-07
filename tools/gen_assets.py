#!/usr/bin/env python3
"""ローカルのComfyUI(127.0.0.1:8188)経由でゲーム素材を生成する。

主人公3種のポーズは手描きシートから切り出す方式に変えたため、ここでは扱わない
（tools/split_sheet.py を参照）。ここで生成するのはボスと背景。

使い方:
    # ComfyUIを起動しておく
    #   cd ~/projects/twitter-manga-bot/comfyui/ComfyUI
    #   ./.venv/bin/python main.py --listen 127.0.0.1 --port 8188
    python3 tools/gen_assets.py            # 全部生成
    python3 tools/gen_assets.py player_idle boss1   # 指定したものだけ生成

生成物は assets/raw/<name>.png に入る。背景の切り抜きは tools/cutout.py が行う。
"""

import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "assets" / "raw"

CHECKPOINT = "NoobAI-XL-v1.1.safetensors"

QUALITY = "masterpiece, best quality, newest, absurdres, highres, very aesthetic"
NEGATIVE = (
    "worst quality, low quality, bad anatomy, blurry, jpeg artifacts, "
    "text, watermark, signature, username, logo, multiple views, "
    "photo, realistic, 3d, border, frame, cropped, shadow on background"
)

# 主人公は同じシードで揃えることで、ポーズ違いでも同じキャラに見えやすくする
PLAYER_SEED = 20260906
PLAYER_BASE = (
    "1boy, baby, toddler, chibi, oversized head, chubby, round face, "
    "short black hair, dark brown eyes, large sparkling eyes, blush, very cute, "
    "pacifier in mouth, wearing white cloth diaper, bare feet, "
    "holding oversized greatsword, tiny knight, "
)
FLAT_BG = "solid pure white background, simple background, isolated on white, no shadow, full body"
# 暗い被写体を切り抜くとき用。白背景だと輪郭が拾えないため緑地に出す
GREEN_BG = "solid flat chroma green background, simple background, no shadow"

# ハンマーベイビー / ゆみベイビー。つるぎベイビーと兄弟に見えるよう素体は共通で、
# 武器と被り物だけを変えて見分けがつくようにする
BABY_CORE = (
    "solo, 1boy, baby, toddler, chibi, oversized head, chubby, round face, "
    "short black hair, dark brown eyes, large sparkling eyes, blush, very cute, "
    "pacifier in mouth, wearing white cloth diaper, bare feet, "
)
POSE_NEG = ("2boys, 2girls, multiple boys, multiple people, holding a baby, doll, plush toy, "
            "sitting, sitting down, sitting on the floor, lying down, crawling, "
            "on the ground, chair, bench, stool, wooden board, basket, bucket, "
            "adult hand, giant hand, another person, ")

HAMMER_SEED = 20260907
HAMMER_BASE = BABY_CORE + (
    "orange knitted cap with tiny horns, holding gigantic wooden war hammer, "
    "huge mallet, tiny berserker, "
)
BOW_SEED = 20260908
BOW_BASE = BABY_CORE + (
    "green hood, small quiver of arrows on back, holding oversized wooden bow, "
    "tiny archer, "
)

# 第二形態。第一形態と一目で違うと分かるよう、シルエットから変える
BOSS1B_BASE = (
    "gigantic shattered porcelain doll monster, cracked white porcelain face split open, "
    "glowing red light pouring out of the cracks, long tattered black victorian dress in rags, "
    "extra jointed porcelain arms sprouting from the back, floating porcelain shards, "
    "glowing red eyes, boss enemy, dark fantasy, horrifying, "
)

# ボス1(人形)の見た目。ポーズ違いでも同じ個体に見えるよう共通化する
BOSS1_BASE = (
    "giant creepy porcelain doll, cracked white face, dead hollow eyes, "
    "long frilly white victorian dress, jointed limbs, monster, boss enemy, "
    "dark fantasy, ominous, "
)

ASSETS = {
    "boss1": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "standing still, arms down, facing left, side view, " + FLAT_BG,
        "seed": 424242,
        "width": 1024,
        "height": 1024,
    },
    "boss1_windup": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "raising both arms high overhead, winding up for a heavy attack, "
        "leaning back, menacing, facing left, side view, " + FLAT_BG,
        "seed": 424242,
        "width": 1024,
        "height": 1024,
    },
    "boss1_attack": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "swinging both arms down forward, striking, lunging forward, "
        "motion lines, attacking, facing left, side view, " + FLAT_BG,
        "seed": 424242,
        "width": 1024,
        "height": 1024,
    },
    # ロゴの"BABY"に履かせるおむつ。白いので緑背景で出して切り抜く
    "boss2": {
        "prompt": QUALITY
        + ", giant menacing teddy bear monster, torn stitches, glowing red eyes, "
        "sharp claws, boss enemy, roaring, facing left, side view, dark fantasy, "
        + FLAT_BG,
        "seed": 913377,
        "width": 1024,
        "height": 1024,
    },
    # タイトルロゴの紋章。黒背景のまま出力し、CSSのscreen合成で乗せるので切り抜き不要
    "boss1_windup_overhead": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "raising both arms straight up high overhead holding them together, about to smash straight down, leaning back, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_throw": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "one arm cocked far back over the shoulder holding a baby rattle, about to throw it, other arm pointing forward, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_low": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "crouching very low to the ground, one arm swept back near the floor, about to sweep along the ground, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_dash": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "crouched forward like a sprinter, both arms trailing behind, leaning far forward, about to charge straight ahead, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_scream": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "head thrown back, mouth wide open screaming, both arms flung out wide to the sides, chest out, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b_windup_overhead": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "raising both arms straight up high overhead holding them together, about to smash straight down, leaning back, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b_windup_throw": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "one arm cocked far back over the shoulder holding a baby rattle, about to throw it, other arm pointing forward, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b_windup_low": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "crouching very low to the ground, one arm swept back near the floor, about to sweep along the ground, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b_windup_dash": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "crouched forward like a sprinter, both arms trailing behind, leaning far forward, about to charge straight ahead, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b_windup_scream": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "head thrown back, mouth wide open screaming, both arms flung out wide to the sides, chest out, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "standing still, arms hanging down, facing left, side view, full body, " + GREEN_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1b_attack": {
        "prompt": QUALITY + ", " + BOSS1B_BASE
        + "swinging all arms down forward, striking, lunging forward, motion lines, "
        "attacking, facing left, side view, full body, " + GREEN_BG,
        "seed": 424243, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_thrust": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "lunging forward low and long, one arm thrust straight ahead like a spear, body stretched out, about to stab, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_spin": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "spinning around on one foot, both arms flung out wide horizontally, dress flaring out, mid spin, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_stomp": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "both arms raised overhead, one leg lifted very high, about to stomp the ground with tremendous force, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_rain": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "both arms raised straight up to the sky, head tilted back looking up, summoning something from above, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_charge": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "hunched over, gathering dark energy between both hands in front of the chest, glowing sphere, straining, building up power, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_windup_roll": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "leaping sideways curled up, tumbling, dodging out of the way, mid air, "
        "winding up for an attack, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },
    "boss1_exhausted": {
        "prompt": QUALITY + ", " + BOSS1_BASE
        + "hunched over exhausted, arms hanging limp at the sides, head hanging down, "
        "staggering, out of breath, defenseless, facing left, side view, full body, " + FLAT_BG,
        "seed": 424242, "width": 1024, "height": 1024,
        "negative_extra": "multiple views, character sheet, multiple poses, 2girls, background objects",
    },

    "bg_arena": {
        "prompt": QUALITY
        + ", no humans, scenery, abandoned nursery turned into a gothic boss arena, "
        "giant crumbling stone pillars, scattered toy blocks, moonlight through broken window, "
        "dark fantasy, atmospheric, wide shot, empty floor in foreground",
        "seed": 5150,
        "width": 1344,
        "height": 768,
        "negative_extra": "character, person, doll, bear",
    },
}


def build_workflow(spec):
    negative = NEGATIVE
    if spec.get("negative_extra"):
        negative = spec["negative_extra"] + ", " + negative

    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": spec["prompt"], "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["1", 1]},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": spec["width"], "height": spec["height"], "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": spec["seed"],
                "steps": 28,
                "cfg": 5.0,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": "babyden"},
        },
    }


def post(path, payload):
    req = urllib.request.Request(
        COMFY + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def get(path):
    with urllib.request.urlopen(COMFY + path) as resp:
        return json.load(resp)


def fetch_image(info):
    params = urllib.parse.urlencode(
        {"filename": info["filename"], "subfolder": info.get("subfolder", ""), "type": info.get("type", "output")}
    )
    with urllib.request.urlopen(f"{COMFY}/view?{params}") as resp:
        return resp.read()


def generate(name, spec, client_id):
    print(f"[gen] {name} ... ", end="", flush=True)
    started = time.time()
    result = post("/prompt", {"prompt": build_workflow(spec), "client_id": client_id})
    prompt_id = result["prompt_id"]

    while True:
        history = get(f"/history/{prompt_id}")
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                print("FAILED")
                for msg in status.get("messages", []):
                    print("   ", msg)
                return False
            outputs = entry.get("outputs", {})
            images = outputs.get("7", {}).get("images", [])
            if images:
                RAW_DIR.mkdir(parents=True, exist_ok=True)
                data = fetch_image(images[0])
                (RAW_DIR / f"{name}.png").write_bytes(data)
                print(f"OK ({time.time() - started:.0f}s)")
                return True
        time.sleep(2)


def main():
    wanted = sys.argv[1:] or list(ASSETS)
    client_id = str(uuid.uuid4())
    for name in wanted:
        if name not in ASSETS:
            print(f"unknown asset: {name}")
            continue
        generate(name, ASSETS[name], client_id)


if __name__ == "__main__":
    main()
