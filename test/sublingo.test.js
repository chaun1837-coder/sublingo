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
  assert.match(html, /batch\.push\(\{ id: cue\.id, text: cue\.source \}\);/);
});

test('logout clears both saved provider keys, temporary subtitle data, and aborts translation', () => {
  assert.match(html, /function clearAppSecretsAndWorkspace\(\)/);
  assert.match(html, /localStorage\.removeItem\('sublingo_saved_api_key_openai'\)/);
  assert.match(html, /localStorage\.removeItem\('sublingo_saved_api_key_gemini'\)/);
  assert.match(html, /activeTranslationController\.abort\(\)/);
  assert.match(html, /\$\('removeFile'\)\.click\(\)/);
  assert.match(html, /signal: requestSignal/);
});

test('oversized subtitle validation happens before translation state is activated', () => {
  const validation = html.indexOf('const oversizedCue = cues.find');
  const activating = html.indexOf('translating = true;', validation);
  assert.ok(validation >= 0 && activating > validation);
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
  assert.match(html, /cues\[idx\]\.translated = translated\.value\.trim\(\)\.length > 0/);
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


test('translation completion uses an explicit status instead of comparing text', () => {
  assert.match(html, /translated: false/);
  assert.match(html, /cue\.translated/);
  assert.match(html, /filter\(\(cue\) => !cue\.translated\)/);
  assert.match(html, /cues\[cue\.id\]\.translated = true/);
});

test('manual translation edits are retained and textareas lock during translation', () => {
  assert.match(html, /cues\[idx\]\.translated = translated\.value\.trim\(\)\.length > 0/);
  assert.match(html, /translated\.disabled = translating/);
  assert.match(html, /field\.disabled = true/);
  assert.match(html, /field\.disabled = false/);
});

test('invalid SRT files clear old cue content and disable download', () => {
  assert.match(html, /Chưa có file hợp lệ/);
  assert.match(html, /\$\('cueList'\)\.innerHTML = ''/);
  assert.match(html, /\$\('downloadBtn'\)\.disabled = true/);
});


test('Gemini upstream status is preserved for the browser retry policy', async () => {
  const { readFile: readSource } = await import('node:fs/promises');
  const server = await readSource(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /error\.upstreamStatus = response\.status/);
  assert.match(server, /Number\.isInteger\(error\?\.upstreamStatus\)/);
  assert.match(server, /Gemini đang tạm quá tải \(503\)/);
});

test('translator backs off and retries only transient HTTP or network failures', () => {
  assert.match(html, /const retryableStatuses = \[408, 429, 500, 502, 503, 504\]/);
  assert.match(html, /const backoffMs = Math\.min\(8000, 1000 \* \(2 \*\* \(attempt - 1\)\)\)/);
  assert.match(html, /requestError\.status = response\.status/);
  assert.match(html, /if \(!canRetry\) throw error/);
  assert.match(html, /failureMessages\[0\]/);
});


test('OpenAI upstream status is preserved so invalid keys are not retried', async () => {
  const { readFile: readSource } = await import('node:fs/promises');
  const server = await readSource(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /async function callOpenAI[\s\S]*?error\.upstreamStatus = response\.status/);
});

test('translation batches respect per-cue and per-request text limits', () => {
  assert.match(html, /const batchSize = 60/);
  assert.match(html, /const maxBatchChars = 24000/);
  assert.match(html, /cue\.source\.length > 5000/);
  assert.match(html, /batchCharacters \+ cue\.source\.length > maxBatchChars/);
});

test('SRT parsing supports CRLF, LF, and legacy CR-only line endings', () => {
  assert.ok(html.includes(String.raw`(?<!\r)\n|\r(?!\n)`));
});

test('SRT export preserves CRLF, LF, and CR-only line endings', () => {
  const formatStart = html.indexOf('function formatCueText(');
  const formatEnd = html.indexOf("$('downloadBtn').addEventListener('click'", formatStart);
  assert.ok(formatStart >= 0 && formatEnd > formatStart);
  const formatter = new Function(html.slice(formatStart, formatEnd) + '; return formatCueText;')();
  const body = 'line one\nline two';
  assert.equal(formatter({ prefix: '1\r\n00:00:01,000 --> 00:00:02,000\r\n', separator: '\r\n\r\n' }, body), 'line one\r\nline two');
  assert.equal(formatter({ prefix: '1\n00:00:01,000 --> 00:00:02,000\n', separator: '\n\n' }, body), 'line one\nline two');
  assert.equal(formatter({ prefix: '1\r00:00:01,000 --> 00:00:02,000\r', separator: '\r\r' }, body), 'line one\rline two');
});

test('Google sign-in polling is bounded when the GIS script does not load', () => {
  assert.match(html, /retryCount < 20/);
  assert.match(html, /initializeGoogleSignIn\(retryCount \+ 1\)/);
});

test('session cookie appends without overwriting the nonce-clearing cookie', async () => {
  const { readFile: readSource } = await import('node:fs/promises');
  const server = await readSource(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /function setSessionCookie[\s\S]*?res\.append\('Set-Cookie'/);
});

test('malformed cookie percent-encoding does not throw from cookie parsing', async () => {
  const { readFile: readSource } = await import('node:fs/promises');
  const server = await readSource(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /try \{ return decodeURIComponent\(part\.slice\(index \+ 1\)\.trim\(\)\); \}\s*catch \{ return ''; \}/);
});

test('download object URL is revoked after the browser starts the download', () => {
  assert.match(html, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1000\)/);
});
