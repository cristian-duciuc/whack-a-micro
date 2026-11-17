import { InputApiError } from '@worklouder/input-kit';
import { ALL_KEYS, LAST_LEVEL, LEVEL_ROUNDS, LIGHTS, gapTime, identifierFor, pickMoles, roundTime, scoreIdentifier } from './game.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const APP_NAME = 'Whack-a-Micro';
const SUPPORTED = new Set(['codex_micro', 'creator_micro_v2', 'creator_micro_v2_base', 'creator_micro_v2_pro']);

export const isApiError = (error, code) => error instanceof InputApiError && error.code === code;
// Input answers with one of these when the saved layer is no longer on the device.
export const isLayerGone = (error) => isApiError(error, -32009) || isApiError(error, -32015);

export async function findDevice(input) {
  const device = (await input.getDevices()).find(({ deviceType }) => SUPPORTED.has(deviceType));
  if (!device) throw new Error('Connect a Creator Micro V2 or Codex Micro and wait for Input to load it.');
  return device.id;
}

// Adds the game layer to the active profile, selects it, and resolves with where it went.
export async function addGameLayer(input, deviceId, definition) {
  const info = await input.getDeviceInfo(deviceId);
  const profileIndex = info.deviceStatus?.selectedProfileIndex ?? 0;
  await input.addLayer({ deviceId, profileIndex, definition });
  // A new layer goes last. Selecting from layer 6 down finds it: missing layers fail with -32015.
  for (let layerIndex = 6; layerIndex >= 1; layerIndex--) {
    try {
      await input.setActiveProfileLayer({ deviceId, profileIndex, layerIndex });
      return { profileIndex, layerIndex };
    } catch (error) {
      if (!isApiError(error, -32015)) throw error;
    }
  }
  throw new Error('Added the layer but could not find it on the profile.');
}

// Plays the game on one device through a connected and authenticated InputClient.
// `emit(type, details)` reports what happens, so the page can show it:
//   idle, start, level { level, moles }, round { level, round, moles, time }, hit { id, score },
//   over { reason: 'slow' | 'wrong', score, wrong }, score { score }
export class Game {
  constructor(input, deviceId, emit = () => {}) {
    this.input = input;
    this.deviceId = deviceId;
    this.emit = emit;
    // Hit moles waiting to turn off. They go out together in one request, so several quick
    // hits don't queue a request each behind InputKit's spacing.
    this.toTurnOff = new Set();
    this.turningOff = null;
  }

  light(identifier, lighting, isRegex = false) {
    return this.input.setKeyLighting({ deviceId: this.deviceId, identifier, isRegex, ...lighting });
  }

  // Resolves with the next pressed key that passes `accept`, or null after `timeout` ms.
  nextPress(accept = () => true, timeout = Infinity) {
    return new Promise((resolve) => {
      const onKey = ({ deviceId, identifier, action }) => {
        if (deviceId !== this.deviceId || action !== 'press' || !accept(identifier)) return;
        finish(identifier);
      };
      const timer = timeout === Infinity ? null : setTimeout(() => finish(null), timeout);
      const finish = (result) => {
        clearTimeout(timer);
        this.input.off('keyTriggered', onKey);
        resolve(result);
      };
      this.input.on('keyTriggered', onKey);
    });
  }

  turnOff(id) {
    this.toTurnOff.add(id);
    this.turningOff ??= (async () => {
      while (this.toTurnOff.size > 0) {
        const keys = identifierFor([...this.toTurnOff]);
        this.toTurnOff.clear();
        await this.light(keys.identifier, LIGHTS.off, keys.isRegex).catch((error) => console.error(error.message));
      }
      this.turningOff = null;
    })();
  }

  // The keys breathe blue until any key is pressed.
  async waitToStart() {
    await this.light(ALL_KEYS, LIGHTS.idle, true);
    this.emit('idle');
    await this.nextPress();
  }

  // Plays one game and resolves with the score.
  async play() {
    await this.light(ALL_KEYS, LIGHTS.off, true);
    this.emit('start');
    this.emit('level', { level: 1, moles: 1 });
    await delay(800);
    let score = 0;
    let level = 1;
    let round = 0; // within the level
    let moles = [];
    for (;;) {
      if (round === LEVEL_ROUNDS && level < LAST_LEVEL) {
        await this.levelUp(++level);
        round = 0;
      }
      moles = pickMoles(moles, level);
      const lit = identifierFor(moles);
      await this.light(lit.identifier, LIGHTS.mole, lit.isRegex);
      const time = roundTime(round, moles.length);
      this.emit('round', { level, round: round + 1, moles, time });
      const deadline = performance.now() + time;
      const left = new Set(moles);
      while (left.size > 0) {
        // A mole already hit is ignored, so a double tap on it is safe.
        const pressed = await this.nextPress((id) => !moles.includes(id) || left.has(id), deadline - performance.now());
        if (pressed !== null && left.has(pressed)) {
          left.delete(pressed);
          this.emit('hit', { id: pressed, score: ++score });
          // Not awaited, so a press on another mole isn't missed while this one turns off.
          this.turnOff(pressed);
          continue;
        }
        for (const id of left) this.turnOff(id);
        await this.turningOff;
        this.emit('over', { reason: pressed ? 'wrong' : 'slow', score, wrong: pressed });
        return score;
      }
      await this.turningOff;
      // Presses between rounds don't count, so a double tap on a hit is safe.
      await delay(gapTime(++round));
    }
  }

  // All keys flash green once per mole of the next level, which then starts slow again.
  // InputKit spaces requests 400 ms apart, so each flash takes about 0.8 seconds.
  async levelUp(level) {
    this.emit('level', { level, moles: level });
    await delay(400);
    for (let flash = 0; flash < level; flash++) {
      await this.light(ALL_KEYS, LIGHTS.levelUp, true);
      await this.light(ALL_KEYS, LIGHTS.off, true);
    }
    await delay(1200);
  }

  // The keys flash red, then one key lights yellow per point.
  async showScore(score) {
    await this.light(ALL_KEYS, LIGHTS.over, true);
    await delay(1200);
    await this.light(ALL_KEYS, LIGHTS.off, true);
    const keys = scoreIdentifier(score);
    if (keys) await this.light(keys.identifier, LIGHTS.score, keys.isRegex);
    this.emit('score', { score });
    await delay(1500);
  }

  // Leaves the keys dark, but doesn't wait long if Input doesn't answer.
  async lightsOut() {
    await Promise.race([this.light(ALL_KEYS, LIGHTS.off, true).catch(() => {}), delay(1500)]);
  }
}
