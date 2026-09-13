import assert from 'node:assert/strict';
import { getUncSpeech } from './unc-speech';

assert.equal(getUncSpeech('custom-hero-sword', 'poison'), 'pull my finger');
assert.equal(getUncSpeech('custom-hero-sword', 'wind'), 'get off my lawn');
assert.equal(getUncSpeech('custom-hero-sword', 'acid'), 'BLEECK');
assert.equal(getUncSpeech('custom-hero-sword', 'cold'), 'Cool off, youngblood');
assert.equal(getUncSpeech('custom-hero-sword', 'fire'), 'See you in hell');
assert.equal(getUncSpeech('unc-special', 'fire'), 'Hold my beer!');
assert.equal(getUncSpeech('unc-death', 'fire'), 'Game over, man.');
assert.equal(getUncSpeech('custom-hero-sword', 'bludgeoning'), null);
assert.equal(getUncSpeech('custom-hero-idle', 'fire'), null);
assert.equal(getUncSpeech('custom-hero-hit', 'fire'), null);
assert.equal(getUncSpeech('custom-guard-tonic', 'fire'), null);
assert.equal(getUncSpeech('custom-drink-potion', 'fire'), null);
console.log('Unc speech assertions passed.');