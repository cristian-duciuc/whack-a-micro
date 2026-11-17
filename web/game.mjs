// Every key of the Creator Micro V2 and Codex Micro, by row (1 at the top) and column.
// Row 1 has no key in column 1 or under the knob, and row 4 none above the stick.
export const ROWS = { 1: [2, 3], 2: [1, 2, 3, 4], 3: [1, 2, 3, 4], 4: [2, 3, 4] };
export const KEYS = Object.entries(ROWS).flatMap(([row, columns]) => columns.map((column) => `mole-r${row}-c${column}`));
export const ALL_KEYS = 'mole-r[1-4]-c[1-4]';

// Level n lights n keys at once. Each level lasts LEVEL_ROUNDS rounds and goes from slow
// to full speed over them; the last level keeps going at full speed until a mistake. A round
// never reuses a key from the round before, so 13 keys leave room for 6 at once.
export const LEVEL_ROUNDS = 30;
export const LAST_LEVEL = 6;

// How long one mole stays up, from the first round of a level to the last. A mole needs one
// request to appear and one to hide, so it can't go much below twice InputKit's 400 ms spacing.
export const UP_MS = [3000, 900];
// Each mole's time varies by up to this much either way, so the pace is hard to predict.
const UP_JITTER = 0.15;
// Every extra mole in a round adds this share of one mole's time, since more keys take longer.
const EXTRA_MOLE_TIME = 0.6;
// The pause before the next round is picked at random from a range that shrinks to nothing
// over the level, so moles come faster and not only leave sooner.
export const FIRST_GAP_MS = [700, 1800];

// How far through its level a round is, from 0 (first round) to 1 (full speed).
const progress = (round) => Math.min(1, round / (LEVEL_ROUNDS - 1));

// How long the moles of a round stay up. `round` counts from 0 within the level.
export function roundTime(round, moles, random = Math.random) {
  const [first, fastest] = UP_MS;
  const one = first * (fastest / first) ** progress(round) * (1 + UP_JITTER * (2 * random() - 1));
  return Math.round(Math.max(fastest, one) * (1 + EXTRA_MOLE_TIME * (moles - 1)));
}

export function gapTime(round, random = Math.random) {
  const [shortest, longest] = FIRST_GAP_MS.map((ms) => ms * (1 - progress(round)));
  return Math.round(shortest + random() * (longest - shortest));
}

// setKeyLighting values, without the deviceId and identifier.
// The Codex Micro rejects effect 0, so a key turns off as a black solid color.
export const LIGHTS = {
  off: { color: 0, brightness: 0, effect: 1 },
  idle: { color: 0x0066ff, brightness: 1, effect: 4, speed: 0.25 }, // slow breath
  mole: { color: 0x00ff00, brightness: 1, effect: 1 },
  over: { color: 0xff0000, brightness: 1, effect: 1 },
  score: { color: 0xffaa00, brightness: 1, effect: 1 },
  levelUp: { color: 0x00ff00, brightness: 1, effect: 1 },
};

// `count` different random keys, none of them a previous mole, so every mole is visibly new.
export function pickMoles(previous, count, random = Math.random) {
  const choices = KEYS.filter((id) => !previous.includes(id));
  const moles = [];
  while (moles.length < count) moles.push(choices.splice(Math.floor(random() * choices.length), 1)[0]);
  return moles;
}

// One setKeyLighting identifier for a set of keys.
export function identifierFor(keys) {
  if (keys.length === 1) return { identifier: keys[0], isRegex: false };
  return { identifier: `mole-(${keys.map((id) => id.slice(5)).join('|')})`, isRegex: true };
}

// The first `score` keys in reading order, all of them at 13 or more.
export function scoreIdentifier(score) {
  const keys = KEYS.slice(0, Math.min(score, KEYS.length));
  return keys.length ? identifierFor(keys) : null;
}
