import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

function getParser() {
  const start = html.indexOf('  function normalizeSrtTimestamp(');
  const end = html.indexOf('  function renderCues()', start);
  assert.ok(start >= 0 && end > start, 'parser source must exist');
  return new Function(html.slice(start, end) + '; return parseSrt;')();
}

function getFormatter() {
  const start = html.indexOf('  function formatCueText(');
  const end = html.indexOf("  $('downloadBtn').addEventListener", start);
  assert.ok(start >= 0 && end > start, 'formatter source must exist');
  return new Function(html.slice(start, end) + '; return formatCueText;')();
}

test('SRT parser preserves original timestamp text byte-for-byte', () => {
  const parseSrt = getParser();
  const formatCueText = getFormatter();
  const source = '1\r\n00:00:01.250  -->  00:00:03.500 X1:10\r\nHello\r\n\r\n2\n00:00:04,000 --> 00:00:05,000\nWorld';
  const { parsedChunks, parsedCues } = parseSrt(source);
  assert.equal(parsedCues.length, 2);
  assert.ok(parsedCues[0].prefix.includes('00:00:01.250  -->  00:00:03.500 X1:10\r\n'));
  assert.equal(parsedCues[0].time, '00:00:01,250 --> 00:00:03,500 X1:10');
  const output = parsedChunks.map((chunk) => chunk.cue
    ? chunk.cue.prefix + formatCueText(chunk.cue, chunk.cue.source) + chunk.separator
    : chunk.raw + chunk.separator).join('');
  assert.equal(output, source);
});

test('SRT parser supports CRLF, LF and legacy CR-only line endings', () => {
  const parseSrt = getParser();
  const fixtures = [
    '1\r\n00:00:01,000 --> 00:00:02,000\r\nLine\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nNext',
    '1\n00:00:01,000 --> 00:00:02,000\nLine\n\n2\n00:00:02,000 --> 00:00:03,000\nNext',
    '1\r00:00:01,000 --> 00:00:02,000\rLine\r\r2\r00:00:02,000 --> 00:00:03,000\rNext'
  ];
  for (const source of fixtures) {
    const parsed = parseSrt(source);
    assert.equal(parsed.parsedCues.length, 2);
    assert.equal(parsed.parsedChunks.map((chunk) => chunk.raw + chunk.separator).join(''), source);
  }
});

test('formatter converts edited line endings to match each original cue', () => {
  const formatCueText = getFormatter();
  const body = 'line one\nline two';
  assert.equal(formatCueText({ prefix: '1\r\n00:00:01,000 --> 00:00:02,000\r\n', separator: '\r\n\r\n' }, body), 'line one\r\nline two');
  assert.equal(formatCueText({ prefix: '1\n00:00:01,000 --> 00:00:02,000\n', separator: '\n\n' }, body), 'line one\nline two');
  assert.equal(formatCueText({ prefix: '1\r00:00:01,000 --> 00:00:02,000\r', separator: '\r\r' }, body), 'line one\rline two');
});

test('SRT export reconstructs cue from original prefix and exact separator', () => {
  assert.match(html, /const prefix = raw\.slice\(0, prefixEnd\);/);
  assert.match(html, /const source = raw\.slice\(prefixEnd\);/);
  assert.match(html, /return cue\.prefix \+ \(value === null \? cues\[cue\.id\]\.translation : value\) \+ chunk\.separator;/);
});

test('timestamp-like content in translated dialogue is blocked before download', () => {
  const formatCueText = getFormatter();
  const cue = { prefix: '1\n00:00:01,000 --> 00:00:02,000\n', separator: '\n\n' };
  assert.equal(formatCueText(cue, '00:00:03,000 --> 00:00:04,000\nInjected timestamp'), null);
});

test('AI responses update only translation text by cue ID', () => {
  assert.match(html, /cues\[cue\.id\]\.translation = byId\.get\(cue\.id\);/);
  assert.match(html, /batch\.push\(\{ id: cue\.id, text: cue\.source \}\);/);
  assert.match(html, /cues\[cue\.id\]\.translated = true;/);
});

test('logout removes both provider keys and temporary workspace data', () => {
  assert.match(html, /function clearAppSecretsAndWorkspace\(\)/);
  assert.match(html, /localStorage\.removeItem\('sublingo_saved_api_key_openai'\)/);
  assert.match(html, /localStorage\.removeItem\('sublingo_saved_api_key_gemini'\)/);
  assert.match(html, /sessionStorage\.removeItem\(key\)/);
  assert.match(html, /activeTranslationController\.abort\(\)/);
  assert.match(html, /\$\('removeFile'\)\.click\(\)/);
});

test('translation requests are cancellable and retry delays stop on abort', () => {
  assert.match(html, /const requestController = new AbortController\(\)/);
  assert.match(html, /signal: requestSignal/);
  assert.match(html, /function waitFor\(ms, signal\)/);
  assert.match(html, /requestSignal\.aborted/);
  assert.match(html, /activeApiKey = ''/);
});

test('file size and cue count are bounded before rendering', () => {
  assert.match(html, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(html, /result\.parsedCues\.length > 5000/);
});

test('concurrent file reads cannot replace a newer file selection', () => {
  assert.match(html, /const readToken = \+\+fileReadToken/);
  assert.match(html, /if \(readToken === fileReadToken\)/);
});

test('oversized cue validation happens before translation state is activated', () => {
  const validation = html.indexOf('const oversizedCue = cues.find');
  const activating = html.indexOf('translating = true;', validation);
  assert.ok(validation >= 0 && activating > validation);
});

test('translation settings are snapshotted so changing tabs cannot mutate an active job', () => {
  assert.match(html, /const requestProvider = provider/);
  assert.match(html, /const requestModel = \$\('model'\)\.value/);
  assert.match(html, /provider: requestProvider/);
  assert.match(html, /model: requestModel/);
});

test('Google sign-in refreshes one-time nonce after a failed attempt', () => {
  assert.ok(html.includes("fetch('/api/auth/google'"));
  assert.match(html, /window\.google\.accounts\.id\.initialize/);
  assert.match(html, /A failed attempt may already have consumed the one-time nonce/);
  assert.match(html, /await initializeGoogleSignIn\(\)/);
});

test('Google sign-in polling is bounded when GIS script does not load', () => {
  assert.match(html, /retryCount < 20/);
  assert.match(html, /initializeGoogleSignIn\(retryCount \+ 1\)/);
});

test('all static element references exist and inline JavaScript parses', () => {
  const definedIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const referencedIds = [...html.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
  for (const id of referencedIds) assert.ok(definedIds.has(id), 'missing element: ' + id);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, 'expected an inline application script');
  for (const script of scripts) assert.doesNotThrow(() => new Script(script[1]));
});

test('navigation contains only Page 1 and Page 2', () => {
  for (const id of ['pageOneTab','pageTwoTab','pageOneContent','pageTwoContent']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /pageThreeTab|pageThreeContent|social[A-Z]|social-|social_|Hardsub OCR|tesseract\.js|function ocrPrepareFrame/i);
  assert.match(html, /function showPage\(pageNumber\)/);
  assert.match(html, /const isPageOne = pageNumber === 1/);
  assert.match(html, /const isPageTwo = pageNumber === 2/);
  assert.match(html, /\$\('pageOneContent'\)\.hidden = !isPageOne/);
  assert.match(html, /\$\('pageTwoContent'\)\.hidden = !isPageTwo/);
  assert.match(html, /\$\('pageOneTab'\)\.addEventListener\('click', \(\) => showPage\(1\)\)/);
  assert.match(html, /\$\('pageTwoTab'\)\.addEventListener\('click', \(\) => showPage\(2\)\)/);
});


test('translation progress uses an explicit completion flag, including for unchanged text', () => {
  assert.match(html, /translated: false/);
  assert.match(html, /const done = cues\.filter\(\(cue\) => cue\.translated\)\.length/);
  assert.match(html, /const remaining = cues\.filter\(\(cue\) => !cue\.translated\)\.length/);
});

test('manual translation edits are retained and locked while an AI job is running', () => {
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

test('backend preserves upstream status codes for retry decisions', () => {
  assert.match(server, /error\.upstreamStatus = response\.status/);
  assert.match(server, /Number\.isInteger\(error\?\.upstreamStatus\)/);
  assert.match(server, /Gemini đang tạm quá tải \(503\)/);
});


test('Gemini Flash-Lite supports user-selectable thinking levels', () => {
  assert.match(html, /id="thinkingLevel"/);
  for (const level of ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']) assert.match(html, new RegExp('value="' + level + '"'));
  assert.match(html, /const thinkingLevelStorageKey = 'sublingo_gemini_thinking_level'/);
  assert.match(html, /thinkingLevel: requestThinkingLevel/);
  assert.match(server, /thinkingLevel: z\.enum\(\['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'\]\)\.default\('MINIMAL'\)/);
  assert.match(server, /thinkingConfig: \{ thinkingLevel \}/);
  assert.match(server, /input\.thinkingLevel/);
  assert.match(server, /const allowedGeminiModels = \['gemini-3\.5-flash-lite'\]/);
  assert.doesNotMatch(server, /gemini-3\.8-flash/);
  assert.doesNotMatch(html, /gemini-3\.8-flash|Gemini 3\.8 Flash/);
  assert.doesNotMatch(server.slice(server.indexOf('async function callGemini'), server.indexOf("app.post('/api/translate'")), /temperature:/);
});

test('temporary upstream failures honor Retry-After and use capped exponential backoff', () => {
  assert.match(html, /const retryableStatuses = \[408, 429, 500, 502, 503, 504\]/);
  assert.match(html, /const fallbackBackoffMs = Math\.min\(60000, 1000 \* \(2 \*\* \(attempt - 1\)\)\)/);
  assert.match(html, /requestError\.retryAfterMs = Number\(data\.retryAfterMs\) \|\| 0/);
  assert.match(html, /if \(error\.quotaType === 'daily'\) throw error/);
  assert.match(server, /function parseRetryAfterMs\(response, data\)/);
  assert.match(server, /google\.rpc\.RetryInfo/);
  assert.match(server, /function isDailyQuotaExceeded\(data\)/);
  assert.match(server, /retryAfterMs: error\.retryAfterMs/);
  assert.match(html, /if \(lastError\?\.status === 429\) break/);
  assert.match(html, /failureMessages\[0\]/);
});

test('Gemini pacing uses request start times and does not add idle delay after slow responses', () => {
  assert.match(html, /const geminiMinIntervalMs = 4500/);
  assert.match(html, /const elapsed = Date\.now\(\) - lastGeminiRequestAt/);
  assert.match(html, /waitMs = Math\.max\(waitMs, geminiMinIntervalMs - elapsed\)/);
});

test('backend only accepts current OpenAI and supported Gemini model IDs', () => {
  assert.match(server, /gpt-6-luna/);
  assert.match(server, /gpt-6\.1-terra/);
  assert.doesNotMatch(server, /gemini-3\.8-flash/);
  assert.match(server, /gemini-3\.5-flash-lite/);
});

test('OpenAI request JSON mode is no-store and does not log API keys', () => {
  assert.match(server, /text: \{ format: \{ type: 'json_object' \} \}/);
  assert.match(server, /store: false/);
  assert.match(server, /Authorization:.*apiKey/);
  assert.doesNotMatch(server, /console\.(?:log|info|warn|error)\([^;\n]*apiKey/);
});

test('client disconnect aborts upstream AI work', () => {
  assert.match(server, /req\.once\('aborted', \(\) => clientController\.abort\(\)\)/);
  assert.match(server, /if \(!res\.writableEnded\) clientController\.abort\(\)/);
  assert.match(server, /AbortSignal\.any\(\[clientSignal, AbortSignal\.timeout/);
});

test('invalid model, duplicate cue IDs and oversized translation payloads are rejected', () => {
  assert.match(server, /Mô hình OpenAI không được hỗ trợ/);
  assert.match(server, /ID phụ đề bị trùng/);
  assert.match(server, /totalTextChars > 30000/);
});

test('session and nonce cookies are HttpOnly, SameSite strict and secure in production', () => {
  assert.match(server, /HttpOnly; SameSite=Strict; Max-Age=/);
  assert.match(server, /isProduction \? '; Secure' : ''/);
});

test('session cookie appends without overwriting the nonce-clearing cookie', () => {
  assert.match(server, /function setSessionCookie[\s\S]*?res\.append\('Set-Cookie'/);
});

test('malformed cookie encoding does not crash cookie parsing', () => {
  assert.match(server, /try \{ return decodeURIComponent\(part\.slice\(index \+ 1\)\.trim\(\)\); \}\s*catch \{ return ''; \}/);
});

test('malformed JSON and oversized bodies return JSON errors', () => {
  assert.match(server, /Dữ liệu JSON gửi lên không hợp lệ/);
  assert.match(server, /Yêu cầu quá lớn\. Hãy chia nhỏ file phụ đề/);
});

test('index HTML is not cached so fixes appear without stale frontend code', () => {
  assert.match(server, /path\.basename\(filePath\) === 'index\.html'/);
  assert.match(server, /res\.set\('Cache-Control', 'no-store'\)/);
});

test('package, backend, README and visible UI expose the same semantic version and release notes', () => {
  assert.equal(pkg.version, '1.2.27');
  assert.match(html, /SRT TRANSLATOR · v1\.2\.27/);
  assert.match(server, /APP_VERSION/);
  assert.match(server, /APP_VERSION = process\.env\.npm_package_version \|\| '1\.2\.27'/);
  assert.match(readme, /^# SubLingo 1\.2\.27/m);
  assert.match(readme, /\*\*Phiên bản hiện tại:\*\* 1\.2\.27/);
  assert.match(readme, /### 1\.2\.27 — 2026-11-05/);
  assert.match(readme, /### 1\.2\.26 — 2026-11-05/);
  assert.match(readme, /thanh tiến trình AI cho Trang 3/);
  assert.match(readme, /giới hạn phân tích 9\.000 ký tự/);
});

test('Google session and translation API responses are never cached', () => {
  assert.match(server, /function noStore\(_req, res, next\)/);
  assert.match(server, /app\.get\('\/api\/me', noStore, authenticate/);
  assert.match(server, /app\.get\('\/api\/auth\/nonce', requireSameOrigin, noStore/);
  assert.match(server, /app\.post\('\/api\/auth\/google', requireSameOrigin, noStore/);
  assert.match(server, /app\.post\('\/api\/auth\/logout', requireSameOrigin, noStore/);
  assert.match(server, /app\.post\('\/api\/translate', requireSameOrigin, noStore/);
  assert.match(html, /fetch\('\/api\/me', \{ credentials: 'same-origin', cache: 'no-store' \}\)/);
});

test('Gemini errors distinguish invalid requests, invalid keys, and forbidden access', () => {
  const gemini = server.slice(server.indexOf('async function callGemini'), server.indexOf("app.post('/api/translate'"));
  assert.match(gemini, /response\.status === 400/);
  assert.match(gemini, /response\.status === 401/);
  assert.match(gemini, /response\.status === 403/);
  assert.match(gemini, /Gemini không chấp nhận API key \(401\)/);
  assert.match(gemini, /API key hiện không có quyền dùng Gemini \(403\)/);
});

test('Google login explains when OAuth Client ID has not been configured', () => {
  assert.match(html, /Đăng nhập Google đang chờ cấu hình/);
  assert.match(html, /Đăng nhập Google chưa được bật trên website/);
});

test('OpenAI Responses JSON mode is enabled and prompt explicitly requests JSON', () => {
  assert.match(server, /text: \{ format: \{ type: 'json_object' \} \}/);
  assert.match(server, /Output only JSON/);
});

test('speech-to-text uploads are bounded and use FFmpeg plus secure multipart upload', () => {
  assert.equal(pkg.dependencies.multer, '^2.5.0');
  assert.equal(pkg.dependencies['ffmpeg-static'], '^5.3.0');
  assert.ok(server.includes('MAX_VIDEO_BYTES = 150 * 1024 * 1024'));
  assert.ok(server.includes('MAX_AUDIO_CHUNK_BYTES = 24 * 1024 * 1024'));
  assert.ok(server.includes('transcribeLimiter = rateLimit'));
  assert.ok(server.includes("videoUpload.single('video')"));
  assert.ok(server.includes("app.post('/api/transcribe'"));
});

test('speech-to-text uses Gemini word timestamps and removes temporary files', () => {
  assert.ok(server.includes("model: 'gemini-3.5-transcribe'"));
  assert.ok(server.includes("timestamp_granularities: ['word']"));
  assert.ok(server.includes("annotation?.type !== 'word_info'"));
  assert.ok(server.includes("https://generativelanguage.googleapis.com/v1beta/interactions"));
  assert.ok(server.includes("https://generativelanguage.googleapis.com/upload/v1beta/files"));
  assert.ok(server.includes('async function deleteGeminiFile'));
  assert.ok(server.includes('await deleteGeminiFile(apiKey, uploadedFileName)'));
  assert.ok(server.includes('function groupTimedWords(words, language'));
  assert.ok(server.includes('await unlink(uploadedPath)'));
  assert.ok(server.includes('await rm(workDir, { recursive: true, force: true })'));
  assert.ok(server.includes('afftdn=nf=-25'));
  assert.ok(server.includes("stage: 'normalizing'"));
  assert.ok(server.includes("stage: 'aligning'"));
});

test('speech-to-text frontend shares Gemini key from Page 1 and supports export', () => {
  for (const id of ['sttVideoInput', 'sttLanguage', 'sttApiKey', 'sttVideoPreview', 'sttCaptionList', 'sttCancelBtn', 'sttDownloadBtn']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(html.includes("loadSavedKey('gemini')"));
  assert.ok(html.includes("savedKeyStorageName('gemini')"));
  assert.ok(html.includes('Google Gemini API key'));
  assert.ok(html.includes('function makeSttSrt(captions, offset = 0)'));
  assert.ok(html.includes("anchor.download = base + '_auto.srt'"));
  const pageTwoStart = html.indexOf('id="pageTwoContent"');
  const pageTwoEnd = html.indexOf('</main>', pageTwoStart);
  assert.doesNotMatch(html.slice(pageTwoStart, pageTwoEnd), /OpenAI API key/);
});


test('Gemini Transcribe rate limits use automatic retries but daily quota is not retried', () => {
  assert.match(server, /async function fetchGeminiWithRetry/);
  assert.match(server, /const maxAttempts = 4/);
  assert.match(server, /response\.status === 429 && !isDailyQuotaExceeded\(data\)/);
  assert.match(server, /parseRetryAfterMs\(response, data\)/);
  assert.match(server, /await waitForRetry\(waitMs, clientSignal\)/);
  assert.match(server, /SubLingo sẽ tự thử lại sau/);
  assert.match(server, /Hãy đợi quota được đặt lại/);
});

test('Gemini Transcribe extracts word_info annotations and uses 18-minute chunks', () => {
  assert.match(server, /const AUDIO_CHUNK_SECONDS = 1080/);
  assert.match(server, /function geminiOffsetSeconds/);
  assert.match(server, /annotation\?\.type !== 'word_info'/);
  assert.match(server, /annotation\.start_offset/);
  assert.match(server, /annotation\.end_offset/);
  assert.match(server, /store: false/);
});


test('Page 2 progress bar matches Page 1 sizing and exposes accessible live progress', () => {
  assert.match(html, /\.stt-progress-track \{ height:18px;/);
  assert.match(html, /id="sttProgressTrack" role="progressbar"/);
  assert.match(html, /aria-label="Tiến độ tạo phụ đề"/);
  assert.match(html, /sttProgressTrack'\)\.setAttribute\('aria-valuenow'/);
  assert.match(html, /sttProgressFill'\)\.style\.width = safePercent \+ '%'/);
});


test('Page 2 bounds long preview captions and limits generated caption length', () => {
  assert.ok(html.includes('max-height:58%; overflow-y:auto'));
  assert.ok(server.includes('current.length >= 9'));
  assert.ok(html.includes('overflow-wrap:anywhere'));
});

test('Page 2 keeps the long-running transcription stream alive', () => {
  assert.ok(server.includes("setInterval(() => sendEvent({ type: 'heartbeat' }), 15000)"));
  assert.ok(server.includes('if (heartbeat) clearInterval(heartbeat)'));
  assert.ok(html.includes('xhr.timeout = 15 * 60 * 1000'));
});

test('Page 2 aligns chunk boundaries using FFmpeg segment CSV and removes detectable leading silence', () => {
  assert.ok(server.includes("silencedetect=noise=-42dB:d=0.5"));
  assert.ok(server.includes("'-segment_list_type', 'csv'"));
  assert.ok(server.includes('segmentOffsets.get(chunkFiles[index])'));
  assert.ok(server.includes('leadingSilenceSeconds + (Number.isFinite(segmentStart)'));
});

test('Page 2 supports user-defined exact transcription corrections', () => {
  assert.ok(server.includes('function applySubtitleCorrections'));
  assert.ok(server.includes("corrections: z.string().max(3000).default('')"));
  assert.ok(html.includes('id="sttCorrections"'));
  assert.ok(html.includes('em dít =&gt; edit'));
});

test('Page 2 conservatively removes filler sounds and tightly repeated short stutters', () => {
  assert.ok(server.includes('function removeSpeechDisfluencies'));
  assert.ok(server.includes('ừm+|ờm+'));
  assert.ok(html.includes('id="sttCleanDisfluencies" type="checkbox" checked'));
});

test('Page 2 time offset is consistently applied to preview, cue seeking and SRT export', () => {
  assert.ok(html.includes('id="sttTimeOffset"'));
  assert.ok(html.includes("cue.start + getSttTimeOffset()"));
  assert.ok(html.includes('makeSttSrt(valid, getSttTimeOffset())'));
  assert.ok(html.includes('(video.currentTime || 0) - getSttTimeOffset()'));
});


test('Filler cleanup removes isolated “thì là mà” but keeps ordinary uses of those words', () => {
  assert.ok(server.includes("stripPunctuation(words[index + 1].word) === 'là'"));
  assert.ok(server.includes("stripPunctuation(words[index + 2].word) === 'mà'"));
  assert.ok(server.includes('gapBefore >= 0.22'));
  assert.ok(server.includes('gapAfter >= 0.22'));
});

test('Manual time adjustment supports long intros up to ten minutes', () => {
  assert.ok(html.includes('min="-600" max="600"'));
  assert.ok(html.includes('Math.max(-600, Math.min(600, value))'));
});


test('Page 2 paginates the caption editor at 50 rows and keeps stable global cue indexes', () => {
  assert.ok(html.includes('const STT_CAPTION_PAGE_SIZE = 50'));
  assert.ok(html.includes('for (let index = firstIndex; index < endIndex; index += 1)'));
  assert.ok(html.includes('id="sttPagination"'));
  assert.ok(html.includes('id="sttPrevPage"'));
  assert.ok(html.includes('id="sttNextPage"'));
  assert.ok(html.includes('dataset.cueIndex'));
});

test('Page 2 finds the active video caption with binary search', () => {
  assert.ok(html.includes('while (low <= high)'));
  assert.ok(html.includes('const middle = (low + high) >> 1'));
  assert.ok(html.includes('sttCaptions[middle].start <= time'));
});

test('Gemini transcription uses BCP-47 language hints and 18-minute audio batches', () => {
  assert.ok(server.includes('const AUDIO_CHUNK_SECONDS = 1080'));
  for (const code of ['vi-VN','en-US','zh-CN','ja-JP','ko-KR','th-TH','fr-FR','es-ES','de-DE']) assert.ok(server.includes(code));
  assert.ok(server.includes("timestamp_granularities: ['word']"));
  assert.ok(server.includes("type: 'verbatim'"));
});

test('FFmpeg audio encoding is limited to one worker thread', () => {
  assert.ok(server.includes("'-threads', '1'"));
});



test('Page 3 navigation and content are fully removed', () => {
  assert.doesNotMatch(html, /pageThreeTab|pageThreeContent|social[A-Z]|social-|social_|api\/social-optimize/i);
  assert.doesNotMatch(server, /socialOptimize|MAX_SOCIAL_ANALYSIS_CHARS|normalizeSocialHashtags|api\/social-optimize/i);
});

test('release version is synchronized across package, backend, UI, and README', () => {
  assert.equal(pkg.version, '1.2.29');
  assert.match(server, /APP_VERSION = process\.env\.npm_package_version \|\| '1.2.29'/);
  assert.match(html, /v1\.2\.28/);
  assert.match(readme, /Phiên bản hiện tại:\*\* 1\.2\.28/);
});
