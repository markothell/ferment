// Pure-function tests for @hs/audio. No browser, no DOM — these cover the
// helpers whose bugs already cost real recordings once.
//
// Carried over from 08's @hs/audio with its tests.
//

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  baseMimeType, fileExtensionFor, formatDuration, resamplePeaks, canRecord, pickMimeType,
} from './recorder';

// --- baseMimeType: the one that killed the first live iPhone recording ------

test('baseMimeType strips the codecs parameter regardless of spacing', () => {
  // Chrome writes it closed up, Safari writes it with a space. Vercel Blob
  // matches allowedContentTypes by EXACT string and does no MIME parsing, so
  // these two spellings are two different entries and an allowlist can only
  // ever name one of them. Stripping leaves one canonical string per format.
  assert.equal(baseMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseMimeType('audio/webm; codecs=opus'), 'audio/webm');
  assert.equal(baseMimeType('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4');
  assert.equal(baseMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(baseMimeType('AUDIO/WEBM; CODECS=OPUS'), 'audio/webm');
});

test('fileExtensionFor covers the iOS branch', () => {
  // Safari and every iOS browser record MP4/AAC, not WebM.
  assert.equal(fileExtensionFor('audio/mp4;codecs=mp4a.40.2'), 'm4a');
  assert.equal(fileExtensionFor('audio/webm;codecs=opus'), 'webm');
  assert.equal(fileExtensionFor('audio/ogg;codecs=opus'), 'ogg');
  assert.equal(fileExtensionFor(''), 'webm');
});

// --- formatDuration ---------------------------------------------------------

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(1000), '0:01');
  assert.equal(formatDuration(61_000), '1:01');
  assert.equal(formatDuration(600_000), '10:00');
  // Never renders a negative clock — remaining time can go past zero between
  // the 200ms timer ticks.
  assert.equal(formatDuration(-5000), '0:00');
});

// --- resamplePeaks ----------------------------------------------------------

test('resamplePeaks returns exactly the requested number of bars', () => {
  assert.equal(resamplePeaks([0.1, 0.9, 0.4], 48).length, 48);
  assert.equal(resamplePeaks(Array.from({ length: 5000 }, () => 0.5), 40).length, 40);
  assert.deepEqual(resamplePeaks([], 48), []);
});

test('resamplePeaks normalizes to the loudest bar', () => {
  // A picture of shape, not of volume: a quiet recording must still draw a
  // waveform rather than a flat line.
  const quiet = resamplePeaks([0.01, 0.02, 0.03, 0.04], 4);
  assert.equal(Math.max(...quiet), 1);

  const loud = resamplePeaks([0.5, 1.0, 0.75, 0.25], 4);
  assert.equal(Math.max(...loud), 1);
});

test('resamplePeaks keeps the peak of each window, not the average', () => {
  // A transient must survive downsampling — averaging would flatten the one
  // loud moment that makes a waveform readable.
  const out = resamplePeaks([0, 0, 1, 0, 0, 0, 0, 0], 2);
  assert.equal(out[0], 1);
});

test('resamplePeaks handles all-silence without dividing by zero', () => {
  const out = resamplePeaks([0, 0, 0, 0], 4);
  assert.deepEqual(out, [0, 0, 0, 0]);
});

// --- capability detection, server-side ---------------------------------------

test('canRecord and pickMimeType are safe with no browser globals', () => {
  // Both run during a Server Component render or a Node import. Neither may
  // throw when MediaRecorder and navigator are absent — a throw here would
  // take down the page rather than fall back to typing.
  assert.equal(pickMimeType(), null);
  assert.equal(canRecord(), false);
});
