import { formatMs } from './timer.js';
import { CHARACTERS } from './characters.js';

export function createUI({ onGoToSelect, onStartFight, onRetryFight, onBackToTitle }) {
  const titleScreen = document.getElementById('title-screen');
  const passwordInput = document.getElementById('password-input');
  const passwordError = document.getElementById('password-error');
  const startButton = document.getElementById('start-button');

  const selectScreen = document.getElementById('select-screen');
  const selectList = document.getElementById('select-list');
  const selectPortrait = document.getElementById('select-portrait-img');
  const selectName = document.getElementById('select-name');
  const selectTagline = document.getElementById('select-tagline');
  const selectStats = document.getElementById('select-stats');
  const selectDetail = document.getElementById('select-detail');
  const selectConfirm = document.getElementById('select-confirm');
  const selectBack = document.getElementById('select-back');

  const hud = document.getElementById('hud');
  const bossName = document.getElementById('boss-name');
  const bossHpFill = document.getElementById('boss-hp-fill');
  const bossPoiseFill = document.getElementById('boss-poise-fill');
  const bossPoiseBar = bossPoiseFill.parentElement;
  const playerHpFill = document.getElementById('player-hp-fill');
  const staminaFill = document.getElementById('player-stamina-fill');
  const staminaBar = staminaFill.parentElement;
  const playerPoiseFill = document.getElementById('player-poise-fill');
  const playerPoiseBar = playerPoiseFill.parentElement;
  const flaskRow = document.getElementById('flask-row');
  const timerDisplay = document.getElementById('timer-display');

  const victoryScreen = document.getElementById('victory-screen');
  const victoryTime = document.getElementById('victory-time');
  const victoryPasswordRow = document.getElementById('victory-password-row');
  const victoryPassword = document.getElementById('victory-password');
  const allClearMessage = document.getElementById('all-clear-message');
  const retryButton = document.getElementById('retry-button');

  const gameoverScreen = document.getElementById('gameover-screen');
  const gameoverRetryButton = document.getElementById('gameover-retry-button');
  const gameoverTitleButton = document.getElementById('gameover-title-button');

  const touchControls = document.getElementById('touch-controls');
  const healCount = document.getElementById('btn-heal-count');

  let selectedCharId = CHARACTERS[0].id;
  let flaskShown = -1;

  // --- 生まれ（主人公）の選択 ---
  for (const char of CHARACTERS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'select-card';
    card.dataset.charId = char.id;
    card.style.setProperty('--accent', char.accent);
    const img = document.createElement('img');
    img.src = char.portrait;
    img.alt = '';
    const label = document.createElement('span');
    label.textContent = char.name;
    card.append(img, label);
    card.addEventListener('click', () => showChar(char.id));
    selectList.appendChild(card);
  }

  function showChar(id) {
    selectedCharId = id;
    const char = CHARACTERS.find((c) => c.id === id);
    selectPortrait.src = char.portrait;
    selectScreen.style.setProperty('--accent', char.accent);
    selectName.textContent = char.name;
    selectTagline.textContent = char.tagline;
    selectDetail.textContent = char.detail;

    selectStats.textContent = '';
    for (const [label, value] of Object.entries(char.stats)) {
      const row = document.createElement('div');
      row.className = 'stat';
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      const bar = document.createElement('span');
      bar.className = 'stat-bar';
      const fill = document.createElement('i');
      fill.style.width = `${value}%`;
      bar.appendChild(fill);
      const num = document.createElement('b');
      num.textContent = value;
      dd.append(bar, num);
      row.append(dt, dd);
      selectStats.appendChild(row);
    }

    for (const card of selectList.children) {
      card.classList.toggle('selected', card.dataset.charId === id);
    }
  }

  startButton.addEventListener('click', () => onGoToSelect(passwordInput.value));
  selectConfirm.addEventListener('click', () => onStartFight(selectedCharId));
  selectBack.addEventListener('click', onBackToTitle);
  retryButton.addEventListener('click', onBackToTitle);
  gameoverRetryButton.addEventListener('click', onRetryFight);
  gameoverTitleButton.addEventListener('click', onBackToTitle);

  function hideAll() {
    titleScreen.hidden = true;
    selectScreen.hidden = true;
    hud.hidden = true;
    victoryScreen.hidden = true;
    gameoverScreen.hidden = true;
    touchControls.hidden = true;
  }

  return {
    showTitle(errorMessage) {
      hideAll();
      titleScreen.hidden = false;
      passwordError.textContent = errorMessage || '';
    },

    showSelect() {
      hideAll();
      selectScreen.hidden = false;
      showChar(selectedCharId);
    },

    showFight(stageName) {
      hideAll();
      hud.hidden = false;
      touchControls.hidden = false;
      bossName.textContent = stageName;
      flaskShown = -1;
    },

    setBossName(name) {
      bossName.textContent = name;
    },

    updateHud({
      playerHpRatio, playerStaminaRatio, playerPoiseRatio, playerStaggered,
      bossHpRatio, bossPoiseRatio, bossStaggered, elapsedMs, flasks, maxFlasks,
    }) {
      playerHpFill.style.width = `${Math.max(0, playerHpRatio * 100)}%`;
      staminaFill.style.width = `${Math.max(0, playerStaminaRatio * 100)}%`;
      staminaBar.classList.toggle('empty', playerStaminaRatio < 0.2);
      playerPoiseFill.style.width = `${Math.max(0, playerPoiseRatio * 100)}%`;
      playerPoiseBar.classList.toggle('broken', playerStaggered);
      bossHpFill.style.width = `${Math.max(0, bossHpRatio * 100)}%`;
      bossPoiseFill.style.width = `${Math.max(0, bossPoiseRatio * 100)}%`;
      bossPoiseBar.classList.toggle('broken', bossStaggered);
      timerDisplay.textContent = formatMs(elapsedMs);

      // エスト瓶の残り。変化したときだけ描き直す
      if (flasks !== flaskShown) {
        flaskShown = flasks;
        flaskRow.textContent = '';
        for (let i = 0; i < maxFlasks; i++) {
          const pip = document.createElement('span');
          pip.className = i < flasks ? 'flask' : 'flask spent';
          flaskRow.appendChild(pip);
        }
        healCount.textContent = flasks;
      }
    },

    showVictory({ elapsedMs, password, isLastStage }) {
      hideAll();
      victoryScreen.hidden = false;
      victoryTime.textContent = formatMs(elapsedMs);
      victoryPasswordRow.hidden = isLastStage;
      allClearMessage.hidden = !isLastStage;
      victoryPassword.textContent = password;
    },

    showGameOver() {
      hideAll();
      gameoverScreen.hidden = false;
    },

    bindTouchButtons(inputManager) {
      const map = {
        'btn-left': 'left',
        'btn-right': 'right',
        'btn-jump': 'jump',
        'btn-attack': 'attack',
        'btn-heal': 'heal',
      };
      for (const [id, action] of Object.entries(map)) {
        inputManager.bindTouchButton(document.getElementById(id), action);
      }
    },
  };
}
