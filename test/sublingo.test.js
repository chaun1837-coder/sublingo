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
