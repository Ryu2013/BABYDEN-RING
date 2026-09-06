// 主人公のスプライトは <接頭辞><ポーズ> というキーで引く。
// 未生成のポーズは null のままになり、renderer 側で つるぎベイビー の絵に代替される。
const POSES = ['Idle', 'Run', 'Attack', 'Swing', 'Guard', 'Roll', 'Charge2', 'Charge3'];
const POSE_FILES = {
  Idle: 'idle', Run: 'run', Attack: 'attack', Swing: 'swing', Guard: 'guard', Roll: 'roll',
  Charge2: 'charge2', Charge3: 'charge3',
};
// つるぎベイビーだけは既存の player_*.png をそのまま使う
const PREFIX_FILES = { sword: 'player', hammer: 'hammer', bow: 'bow' };

// 攻撃の種類ごとの予備動作。この構えを見て何が来るか読ませる
const WINDUPS = ['overhead', 'throw', 'low', 'dash', 'scream'];

const IMAGE_SOURCES = {
  boss1: 'assets/boss1.png',
  boss1_windup: 'assets/boss1_windup.png',
  boss1_attack: 'assets/boss1_attack.png',
  boss1b: 'assets/boss1b.png',
  boss1b_attack: 'assets/boss1b_attack.png',
  boss2: 'assets/boss2.png',
  arena: 'assets/bg_arena.jpg',
};

for (const base of ['boss1', 'boss1b']) {
  for (const w of WINDUPS) {
    IMAGE_SOURCES[`${base}_windup_${w}`] = `assets/${base}_windup_${w}.png`;
  }
}
for (const [prefix, file] of Object.entries(PREFIX_FILES)) {
  for (const pose of POSES) {
    IMAGE_SOURCES[prefix + pose] = `assets/${file}_${POSE_FILES[pose]}.png`;
  }
}

export const images = {};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    // 画像が欠けていてもゲーム自体は動かす（描画側でフォールバックする）
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadAssets() {
  const entries = Object.entries(IMAGE_SOURCES);
  const loaded = await Promise.all(entries.map(([, src]) => loadImage(src)));
  entries.forEach(([key], i) => {
    if (loaded[i]) images[key] = loaded[i];
  });
  return images;
}
