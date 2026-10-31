import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('SRT export reconstructs cue from untouched prefix and exact separator', () => {
  assert.match(html, /return cue\.prefix \+ \(value === null \? cues\[cue\.id\]\.translation : value\) \+ chunk\.separator;/);
  assert.match(html, /const prefix = raw\.slice\(0, prefixEnd\);/);
  assert.match(html, /const source = raw\.slice\(prefixEnd\);/);
});

test('AI updates only translation text by cue id', () => {
  assert.match(html, /cues\[cue\.id\]\.translation = byId\.get\(cue\.id\);/);
  assert.match(html, /map\(\(cue\) => \(\{ id: cue\.id, text: cue\.source \}\)\)/);
});

test('Google sign-in sends credential to backend endpoint', () => {
  assert.match(html, /fetch\('\/api\/auth\/google'/);
  assert.match(html, /window\.google\.accounts\.id\.initialize/);
});


test('SRT download normalizes blank subtitle lines and blocks timestamp injection', () => {
  assert.match(html, /replace\(\/\\n\[ \\t\]\*\\n\+\/g, '\\n'\)/);
  assert.match(html, /Một bản dịch có chứa dòng timestamp/);
});


test('translation completion is tracked independently from text equality', () => {
  assert.match(html, /translated: false/);
  assert.match(html, /const done = cues\.filter\(\(cue\) => cue\.translated\)\.length;/);
  assert.match(html, /\.filter\(\(cue\) => !cue\.translated\)/);
  assert.match(html, /cues\[cue\.id\]\.translated = true;/);
  assert.match(html, /const remaining = cues\.filter\(\(cue\) => !cue\.translated\)\.length;/);
});

test('manual edits count as completed and translation fields lock while translating', () => {
  assert.match(html, /cues\[idx\]\.translated = true/);
  assert.match(html, /translated\.disabled = translating/);
  assert.match(html, /field\.disabled = true/);
  assert.match(html, /field\.disabled = false/);
});

test('invalid SRT selection clears stale cues and disables download', () => {
  assert.match(html, /Chưa có file hợp lệ/);
  assert.match(html, /\$\('cueList'\)\.innerHTML = ''/);
  assert.match(html, /\$\('downloadBtn'\)\.disabled = true/);
});

test('all static element references exist and inline JavaScript parses', async () => {
  const { Script } = await import('node:vm');
  const definedIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const referencedIds = [...html.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
  for (const id of referencedIds) assert.ok(definedIds.has(id), `missing element: ${id}`);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, 'expected an inline application script');
  for (const script of scripts) assert.doesNotThrow(() => new Script(script[1]));
});
