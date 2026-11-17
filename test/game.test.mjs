import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  ALL_KEYS,
  FIRST_GAP_MS,
  KEYS,
  LAST_LEVEL,
  LEVEL_ROUNDS,
  UP_MS,
  gapTime,
  identifierFor,
  pickMoles,
  roundTime,
  scoreIdentifier,
} from '../web/game.mjs';

const middle = () => 0.5; // no jitter

test('the layer has an API key for every hole, in layout order', async () => {
  const layer = JSON.parse(await readFile(new URL('../web/whack-layer.json', import.meta.url), 'utf8'));
  assert.deepEqual(layer.layer.layout.base.map((row) => row.length), [2, 4, 4, 3]);
  const ids = new Map(layer.smartActions.map(({ id, payload }) => [`SA_${id}`, payload.id]));
  assert.deepEqual(layer.layer.layout.base.flat().map(({ keycode }) => ids.get(keycode)), KEYS);
  assert.ok(KEYS.every((id) => new RegExp(`^${ALL_KEYS}$`).test(id)));
});

test('a level goes from slow to full speed over its rounds, then stays there', () => {
  const times = Array.from({ length: LEVEL_ROUNDS + 10 }, (_, round) => roundTime(round, 1, middle));
  assert.equal(times[0], UP_MS[0]);
  assert.equal(times[LEVEL_ROUNDS - 1], UP_MS[1]);
  assert.ok(times.every((time, i) => i === 0 || time < times[i - 1] || time === UP_MS[1]));
  assert.ok(times.slice(LEVEL_ROUNDS).every((time) => time === UP_MS[1]));
  assert.equal(roundTime(0, 1, () => 0), 2550);
  assert.equal(roundTime(0, 1, () => 1), 3450);
  assert.equal(roundTime(LEVEL_ROUNDS - 1, 1, () => 0), UP_MS[1], 'jitter never goes below the floor');
});

test('every extra mole adds time', () => {
  assert.equal(roundTime(0, 2, middle), Math.round(UP_MS[0] * 1.6));
  assert.equal(roundTime(LEVEL_ROUNDS - 1, LAST_LEVEL, middle), Math.round(UP_MS[1] * 4));
});

test('the pause between rounds is random and shrinks to nothing over the level', () => {
  assert.equal(gapTime(0, () => 0), FIRST_GAP_MS[0]);
  assert.equal(gapTime(0, () => 1), FIRST_GAP_MS[1]);
  assert.equal(gapTime(LEVEL_ROUNDS - 1, () => 1), 0);
  const longest = Array.from({ length: LEVEL_ROUNDS }, (_, round) => gapTime(round, () => 1));
  assert.ok(longest.every((gap, i) => i === 0 || gap < longest[i - 1]));
});

test('moles never come up in a hole from the round before, or twice in one round', () => {
  let moles = [];
  for (let i = 0; i < 1000; i++) {
    const count = 1 + (i % LAST_LEVEL);
    const next = pickMoles(moles, count);
    assert.equal(next.length, count);
    assert.equal(new Set(next).size, count);
    assert.ok(next.every((id) => KEYS.includes(id) && !moles.includes(id)));
    moles = next;
  }
  // The last level must still find a full set of new keys after a full round.
  assert.ok(KEYS.length - LAST_LEVEL >= LAST_LEVEL);
  assert.deepEqual(pickMoles([KEYS[0]], 1, () => 0), [KEYS[1]]);
});

test('identifiers cover exactly the given keys', () => {
  const pair = new RegExp(`^${identifierFor(['mole-r2-c1', 'mole-r4-c4']).identifier}$`);
  assert.deepEqual(KEYS.filter((id) => pair.test(id)), ['mole-r2-c1', 'mole-r4-c4']);
  assert.equal(scoreIdentifier(0), null);
  assert.deepEqual(scoreIdentifier(1), { identifier: 'mole-r1-c2', isRegex: false });
  const three = new RegExp(`^${scoreIdentifier(3).identifier}$`);
  assert.deepEqual(KEYS.filter((id) => three.test(id)), KEYS.slice(0, 3));
  const all = new RegExp(`^${scoreIdentifier(500).identifier}$`);
  assert.deepEqual(KEYS.filter((id) => all.test(id)), KEYS);
});
