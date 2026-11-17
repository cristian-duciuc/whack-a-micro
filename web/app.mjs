import { InputClient } from '@worklouder/input-kit';
import { LAST_LEVEL, LEVEL_ROUNDS, ROWS } from './game.mjs';
import { APP_NAME, Game, addGameLayer, findDevice, isApiError, isLayerGone } from './play.mjs';

const $ = (id) => document.getElementById(id);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

// Saved in this browser only: Input's approval for this page, where the layer is, the best score.
const STORAGE_KEY = 'whack-a-micro';
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Without storage the page still works; it just asks again next time.
  }
}
const saved = load();

let input = null;
let deviceId = null;
let game = null;

// The board, laid out like the device. Row 1 has no key in column 1 and the knob in column 4;
// row 4 has the stick in column 1.
function buildBoard() {
  const board = $('board');
  for (let row = 1; row <= 4; row++) {
    for (let column = 1; column <= 4; column++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      if (ROWS[row].includes(column)) {
        slot.classList.add('key');
        slot.dataset.id = `mole-r${row}-c${column}`;
      } else if (row === 1 && column === 4) {
        slot.classList.add('knob');
      } else if (row === 4 && column === 1) {
        slot.classList.add('stick');
      }
      board.append(slot);
    }
  }
}

const keyElement = (id) => $('board').querySelector(`[data-id="${id}"]`);

function clearKeys() {
  for (const key of $('board').querySelectorAll('.key')) key.className = 'slot key';
}

function setBoardMode(mode, flashes) {
  const board = $('board');
  board.classList.remove('idle', 'flash');
  if (!mode) return;
  void board.offsetWidth; // restart the animation
  board.style.setProperty('--flashes', flashes ?? 1);
  board.classList.add(mode);
}

function say(text, tone = '') {
  const message = $('message');
  message.textContent = text;
  message.className = `message ${tone}`;
}

function setConnection(text, tone = '') {
  const pill = $('connection');
  pill.textContent = text;
  pill.className = `pill ${tone}`;
}

// Runs the time bar down over `ms`.
function startTimer(ms) {
  const bar = $('timer-bar');
  bar.style.transition = 'none';
  bar.style.width = '100%';
  void bar.offsetWidth;
  bar.style.transition = `width ${ms}ms linear`;
  bar.style.width = '0';
}

function stopTimer() {
  const bar = $('timer-bar');
  bar.style.transition = 'none';
  bar.style.width = '0';
}

// Shows on the page what the game is doing on the device.
function show(type, details) {
  if (type === 'idle') {
    clearKeys();
    setBoardMode('idle');
    $('level').textContent = '–';
    $('round').textContent = '–';
    $('rules').hidden = false;
    say('Press any key on the device to start.');
  }
  if (type === 'start') {
    clearKeys();
    setBoardMode(null);
    $('rules').hidden = true;
    $('score').textContent = '0';
  }
  if (type === 'level') {
    const { level, moles } = details;
    $('level').textContent = `${level}`;
    $('round').textContent = '–';
    clearKeys();
    stopTimer();
    if (level === 1) {
      say('Level 1: one mole at a time. Go!', 'good');
    } else {
      setBoardMode('flash', moles);
      const last = level === LAST_LEVEL ? ' Last level, it keeps going.' : '';
      say(`Level ${level}: ${WORDS[moles]} moles at once!${last}`, 'good');
    }
  }
  if (type === 'round') {
    const { level, round, moles, time } = details;
    $('round').textContent = level === LAST_LEVEL && round > LEVEL_ROUNDS ? `${round}` : `${round}/${LEVEL_ROUNDS}`;
    clearKeys();
    setBoardMode(null);
    for (const id of moles) keyElement(id)?.classList.add('mole');
    startTimer(time);
  }
  if (type === 'hit') {
    const key = keyElement(details.id);
    key?.classList.remove('mole');
    key?.classList.add('hit');
    $('score').textContent = `${details.score}`;
  }
  if (type === 'over') {
    stopTimer();
    for (const key of $('board').querySelectorAll('.key.mole')) key.classList.replace('mole', 'missed');
    if (details.wrong) keyElement(details.wrong)?.classList.add('wrong');
    say(details.reason === 'wrong' ? 'Wrong hole! Game over.' : 'Too slow! Game over.', 'bad');
  }
  if (type === 'score') {
    const { score } = details;
    const record = score > (saved.best ?? 0);
    if (record) {
      saved.best = score;
      save();
      $('best').textContent = `${score}`;
    }
    say(`Score ${score}.${record ? ' New best!' : ''} Press any key to play again.`, record ? 'good' : '');
  }
}

async function connect() {
  $('connect').disabled = true;
  setConnection('Connecting…');
  input = new InputClient({ applicationName: APP_NAME });
  input.on('disconnected', () => {
    setConnection('Disconnected', 'bad');
    stopTimer();
    say('Lost the connection to Input. Reload the page to reconnect.', 'bad');
  });
  try {
    await input.connect();
    try {
      if (saved.credentials) await input.authenticate(saved.credentials);
    } catch (error) {
      if (!isApiError(error, -32001)) throw error;
      delete saved.credentials; // Input no longer accepts them, so ask again
    }
    if (!saved.credentials) {
      say(`Approve "${APP_NAME}" in Input within 30 seconds.`);
      saved.credentials = await input.requestAuthorization();
      save();
    }
    deviceId = await findDevice(input);
    setConnection('Connected', 'ok');
    game = new Game(input, deviceId, show);
    if (saved.layer) await useLayer(saved.layer);
    else askForLayer();
  } catch (error) {
    setConnection('Not connected', 'bad');
    say(isApiError(error, -32003) ? 'The approval was declined in Input.' : error.message, 'bad');
    $('connect').disabled = false;
  }
}

function askForLayer() {
  $('connect').hidden = true;
  $('layer-setup').hidden = false;
  say('Install the game layer, or pick the one you already have.');
}

async function useLayer(layer) {
  try {
    await input.setActiveProfileLayer({ deviceId, ...layer });
  } catch (error) {
    if (!isLayerGone(error)) throw error;
    delete saved.layer;
    save();
    askForLayer();
    return;
  }
  saved.layer = layer;
  save();
  $('setup').hidden = true;
  playForever();
}

async function installLayer() {
  $('install').disabled = true;
  say('Adding the game layer…');
  try {
    const definition = await (await fetch('whack-layer.json')).json();
    await useLayer(await addGameLayer(input, deviceId, definition));
  } catch (error) {
    say(`Couldn't add the layer: ${error.message}`, 'bad');
    $('install').disabled = false;
  }
}

async function playForever() {
  try {
    for (;;) {
      await game.waitToStart();
      await game.showScore(await game.play());
    }
  } catch (error) {
    if (!input.connected) return; // the disconnect message already explains it
    if (isLayerGone(error)) {
      delete saved.layer;
      save();
      $('setup').hidden = false;
      askForLayer();
      return;
    }
    say(error.message, 'bad');
  }
}

buildBoard();
$('best').textContent = `${saved.best ?? 0}`;
for (let index = 1; index <= 6; index++) $('layer-index').append(new Option(`${index}`, `${index}`, index === 6, index === 6));
$('connect').addEventListener('click', connect);
$('install').addEventListener('click', installLayer);
$('use-layer').addEventListener('click', async () => {
  try {
    const info = await input.getDeviceInfo(deviceId);
    const profileIndex = info.deviceStatus?.selectedProfileIndex ?? 0;
    await useLayer({ profileIndex, layerIndex: Number($('layer-index').value) });
  } catch (error) {
    say(error.message, 'bad');
  }
});
window.addEventListener('pagehide', () => game?.lightsOut());
