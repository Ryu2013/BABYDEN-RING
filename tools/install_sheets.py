"""切り分けたコマを、ゲームで使う名前とサイズで assets/ に入れる。

    <ComfyUIのvenv>/bin/python tools/split_sheet.py <シート> --out /tmp/out/sword ...
    <ComfyUIのvenv>/bin/python tools/install_sheets.py


同じシートに同じ縮尺で描かれているので、キャラごとに1つの倍率をかけるだけで
ポーズ間の大きさが揃う（従来のように後から相対サイズを補正する必要がない）。
"""
import os
from pathlib import Path
from PIL import Image

ROOT = Path('/home/ryuuichi/projects/babyden-ring')
SRC = Path(os.environ.get('SHEET_DIR', '/tmp/sheet_out'))  # split_sheet.py の出力先

# 待機ポーズをこの高さにし、他のポーズは同じ倍率で拡縮する
IDLE_HEIGHT = 260

# シート上の並び順 → ゲーム内の名前
ORDER = {
    'sword':  ['portrait', 'idle', 'run', 'run2', 'attack', 'swing', 'charge2', 'charge3',
               'parry', 'jump', 'roll', 'heal', 'hurt', 'stagger'],
    'hammer': ['portrait', 'idle', 'run', 'run2', 'attack', 'swing', 'charge2', 'charge3',
               'parry', 'jump', 'roll', 'heal', 'hurt', 'stagger'],
    'bow':    ['portrait', 'idle', 'run', 'run2', 'attack', 'swing', 'charge2', 'charge3',
               'jump', 'roll', 'parry', 'heal', 'hurt', 'stagger'],
}
FILE_PREFIX = {'sword': 'player', 'hammer': 'hammer', 'bow': 'bow'}

for group, names in ORDER.items():
    files = sorted((SRC / group).glob('*.png'))
    assert len(files) == len(names), f'{group}: {len(files)}枚 / 名前{len(names)}個'
    pieces = {n: Image.open(f).convert('RGBA') for n, f in zip(names, files)}

    k = IDLE_HEIGHT / pieces['idle'].height
    print(f'--- {group} (倍率 {k:.3f}) ---')
    for name, img in pieces.items():
        w = max(1, round(img.width * k))
        h = max(1, round(img.height * k))
        out = img.resize((w, h), Image.LANCZOS)
        path = ROOT / 'assets' / f'{FILE_PREFIX[group]}_{name}.png'
        out.save(path, optimize=True)
        print(f'  {path.name:26s} {w}x{h}  {path.stat().st_size // 1024}KB')
