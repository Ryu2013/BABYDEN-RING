import { formatMs } from './timer.js';
import { CHARACTERS } from './characters.js';

export function createUI({ onStartFight, onRetryFight, onBackToTitle }) {
  const titleScreen = document.getElementById('title-screen');
  const passwordInput = document.getElementById('password-input');
  const passwordError = document.getElementById('password-error');
  const startButton = document.getElementById('start-button');

  const charCards = document.getElementById('char-cards');
  const charDetail = document.getElementById('char-detail');

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
  const timerDisplay = document.getElementById('timer-display');

  const victoryScreen = document.getElementById('victory-screen');
  const victoryTime = document.getElementById('victory-time');
  const victoryPasswordRow = document.getElementById('victory-password-row');
  const victoryPassword = document.getElementById('victory-password');
  const allClearMessage = document.getElementById('all-clear-message');
  const retryButton = document.getElementById('retry-button');

  const gameoverScreen = document.getElementById('gameover-screen');
  const gameoverRetryButton = document.getElementById('gameover-retry-button');

  const touchControls = document.getElementById('touch-controls');

  let selectedCharId = CHARACTERS[0].id;

  // 主人公の選択カードを組み立てる
  for (const char of CHARACTERS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'char-card';
    card.dataset.charId = char.id;
    card.style.setProperty('--accent', char.accent);
    card.innerHTML = `<span class="char-name"></span><span class="char-tag"></span>`;
    card.querySelector('.char-name').textContent = char.name;
    card.querySelector('.char-tag').textContent = char.tagline;
    card.addEventListener('click', () => selectChar(char.id));
    charCards.appendChild(card);
  }

  function selectChar(id) {
    selectedCharId = id;
    const char = CHARACTERS.find((c) => c.id === id);
    charDetail.textContent = char.detail;
    for (const card of charCards.children) {
      card.classList.toggle('selected', card.dataset.charId === id);
    }
  }
  selectChar(selectedCharId);

  startButton.addEventListener('click', () => onStartFight(passwordInput.value, selectedCharId));
  retryButton.addEventListener('click', onBackToTitle);
  gameoverRetryButton.addEventListener('click', onRetryFight);

  function hideAll() {
    titleScreen.hidden = true;
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

    showFight(stageName) {
      hideAll();
      hud.hidden = false;
      touchControls.hidden = false;
      bossName.textContent = stageName;
    },

    setBossName(name) {
      bossName.textContent = name;
    },

    updateHud({
      playerHpRatio, playerStaminaRatio, playerPoiseRatio, playerStaggered,
      bossHpRatio, bossPoiseRatio, bossStaggered, elapsedMs, guardBroken,
    }) {
      playerHpFill.style.width = `${Math.max(0, playerHpRatio * 100)}%`;
      staminaFill.style.width = `${Math.max(0, playerStaminaRatio * 100)}%`;
      staminaBar.classList.toggle('empty', guardBroken || playerStaminaRatio < 0.2);
      playerPoiseFill.style.width = `${Math.max(0, playerPoiseRatio * 100)}%`;
      playerPoiseBar.classList.toggle('broken', playerStaggered);
      bossHpFill.style.width = `${Math.max(0, bossHpRatio * 100)}%`;
      bossPoiseFill.style.width = `${Math.max(0, bossPoiseRatio * 100)}%`;
      bossPoiseBar.classList.toggle('broken', bossStaggered);
      timerDisplay.textContent = formatMs(elapsedMs);
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
        'btn-roll': 'roll',
        'btn-light': 'lightAttack',
        'btn-heavy': 'heavyAttack',
        'btn-guard': 'guard',
      };
      for (const [id, action] of Object.entries(map)) {
        inputManager.bindTouchButton(document.getElementById(id), action);
      }
    },
  };
}
