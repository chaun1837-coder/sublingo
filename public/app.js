
(() => {
  const $ = (id) => document.getElementById(id);
  let provider = 'gemini';
  let sttXhr = null;
  let sttObjectUrl = '';
  let sttVideoFile = null;
  let sttCaptions = [];
  let sttCaptionPage = 0;
  const STT_CAPTION_PAGE_SIZE = 50;
  let sttLastOverlayCueId = null;
  function showPage(pageNumber) {
    const isPageOne = pageNumber === 1;
    const isPageTwo = pageNumber === 2;
    $('pageOneContent').hidden = !isPageOne;
    $('pageTwoContent').hidden = !isPageTwo;
    $('pageOneTab').classList.toggle('active', isPageOne);
    $('pageTwoTab').classList.toggle('active', isPageTwo);
    for (const tab of [$('pageOneTab'), $('pageTwoTab')]) tab.removeAttribute('aria-current');
    if (isPageOne) $('pageOneTab').setAttribute('aria-current', 'page');
    if (isPageTwo) $('pageTwoTab').setAttribute('aria-current', 'page');
  }
  $('pageOneTab').addEventListener('click', () => showPage(1));
  $('pageTwoTab').addEventListener('click', () => showPage(2));
  let fileName = '';
  let originalText = '';
  let chunks = [];
  let cues = [];
  let toastTimer;
  let fileReadToken = 0;

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }
  function modal(title, message) {
    $('modalTitle').textContent = title;
    $('modalText').textContent = message;
    $('modalBackdrop').classList.add('open');
  }
  $('modalClose').addEventListener('click', () => $('modalBackdrop').classList.remove('open'));
  $('modalOk').addEventListener('click', () => $('modalBackdrop').classList.remove('open'));
  $('modalBackdrop').addEventListener('click', (e) => { if (e.target === $('modalBackdrop')) $('modalBackdrop').classList.remove('open'); });

  function normalizeSrtTimestamp(value) {
    const singleLine = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
    const match = singleLine.match(/^(\d{2,}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2})[,.](\d{3})(.*)$/);
    if (!match) return singleLine;
    return match[1] + ',' + match[2] + ' --> ' + match[3] + ',' + match[4] + match[5];
  }

  function parseSrt(text) {
    const split = text.split(/((?:\r\n|(?<!\r)\n|\r(?!\n))[ \t]*(?:(?:\r\n|(?<!\r)\n|\r(?!\n))[ \t]*)+)/);
    const parsedChunks = [];
    const parsedCues = [];
    const timePattern = /(?:^|\r\n|\n|\r)(\d{2,}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2,}:\d{2}:\d{2}[,.]\d{3}[^\r\n]*)(\r\n|\n|\r)/;
    for (let i = 0; i < split.length; i += 2) {
      const raw = split[i];
      const separator = split[i + 1] || '';
      if (raw === '') { parsedChunks.push({ raw, separator, cue: null }); continue; }
      const match = timePattern.exec(raw);
      if (!match) { parsedChunks.push({ raw, separator, cue: null }); continue; }
      const normalizedTime = normalizeSrtTimestamp(match[1]);
      const prefixEnd = match.index + match[0].length;
      // Keep the original timestamp line byte-for-byte; normalize only the preview label.
      const prefix = raw.slice(0, prefixEnd);
      const source = raw.slice(prefixEnd);
      const cue = { id: parsedCues.length, prefix, source, translation: source, translated: false, time: normalizedTime, separator };
      parsedCues.push(cue);
      parsedChunks.push({ raw, separator, cue });
    }
    return { parsedChunks, parsedCues };
  }
  function renderCues() {
    const list = $('cueList');
    list.innerHTML = '';
    cues.forEach((cue, idx) => {
      const card = document.createElement('div');
      card.className = 'cue-card';
      const index = document.createElement('div');
      index.className = 'cue-index';
      index.textContent = String(idx + 1).padStart(2, '0');
      const left = document.createElement('div');
      left.className = 'cue-content';
      const leftTop = document.createElement('div');
      leftTop.className = 'cue-top';
      const leftLabel = document.createElement('span'); leftLabel.className = 'cue-label'; leftLabel.textContent = 'Bản gốc';
      const time = document.createElement('span'); time.className = 'timecode'; time.textContent = cue.time;
      leftTop.append(leftLabel, time);
      const source = document.createElement('textarea');
      source.className = 'field cue-text original'; source.rows = 3; source.readOnly = true; source.value = cue.source;
      left.append(leftTop, source);
      const right = document.createElement('div');
      right.className = 'cue-content translation-col';
      const rightTop = document.createElement('div'); rightTop.className = 'cue-top';
      const rightLabel = document.createElement('span'); rightLabel.className = 'cue-label'; rightLabel.textContent = 'Bản dịch';
      const target = document.createElement('span'); target.className = 'timecode'; target.textContent = $('targetLang').value;
      rightTop.append(rightLabel, target);
      const translated = document.createElement('textarea');
      translated.className = 'field cue-text translation'; translated.rows = 3; translated.placeholder = 'Nhập hoặc dán nội dung đã dịch...'; translated.value = cue.translation;
      translated.setAttribute('aria-label', `Bản dịch câu ${idx + 1}`);
      translated.addEventListener('input', () => { cues[idx].translation = translated.value; cues[idx].translated = translated.value.trim().length > 0; });
      translated.disabled = translating;
      right.append(rightTop, translated);
      card.append(index, left, right);
      list.append(card);
    });
    $('cueCount').textContent = `${cues.length} câu phụ đề`;
    $('emptyState').style.display = cues.length ? 'none' : 'block';
    list.style.display = cues.length ? 'block' : 'none';
    $('downloadBtn').disabled = cues.length === 0;
  }
  function loadText(text, name) {
    fileReadToken += 1;
    if (activeTranslationController) activeTranslationController.abort();
    originalText = text;
    fileName = name;
    const result = parseSrt(text);
    if (result.parsedCues.length > 5000) {
      fileName = ''; originalText = ''; chunks = []; cues = [];
      $('fileMeta').classList.remove('visible'); $('cueList').innerHTML = ''; $('cueList').style.display = 'none';
      $('emptyState').style.display = 'block'; $('cueCount').textContent = 'File quá lớn'; $('downloadBtn').disabled = true;
      toast('File có hơn 5.000 câu phụ đề. Hãy chia nhỏ file để xử lý ổn định hơn.');
      return;
    }
    chunks = result.parsedChunks;
    cues = result.parsedCues;
    $('fileName').textContent = name;
    $('fileDetails').textContent = `${(new Blob([text]).size / 1024).toFixed(1)} KB · ${cues.length} cue hợp lệ`;
    $('fileMeta').classList.add('visible');
    $('cueCount').textContent = `${cues.length} câu phụ đề`;
    if (!cues.length) {
      chunks = [];
      fileName = '';
      originalText = '';
      $('fileMeta').classList.remove('visible');
      $('cueList').innerHTML = '';
      $('cueList').style.display = 'none';
      $('emptyState').style.display = 'block';
      $('cueCount').textContent = 'Chưa có file hợp lệ';
      $('downloadBtn').disabled = true;
      $('preserveNote').textContent = '🔒 Số thứ tự và mốc thời gian được khóa, không cho chỉnh sửa.';
      toast('Không tìm thấy cue SRT hợp lệ. Hãy kiểm tra định dạng file.');
      return;
    }
    renderCues();
    $('preserveNote').textContent = '🔒 Đã khóa số thứ tự, timestamp và cấu trúc gốc.';
    toast(`Đã đọc ${cues.length} cue. Cấu trúc gốc được giữ nguyên.`);
  }
  function handleFile(file) {
    if (!file) return;
    if (!/\.srt$/i.test(file.name)) { toast('Vui lòng chọn file có đuôi .srt.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('File vượt quá 10 MB. Hãy chia nhỏ file SRT rồi thử lại.'); return; }
    if (activeTranslationController) activeTranslationController.abort();
    const readToken = ++fileReadToken;
    const reader = new FileReader();
    reader.onload = () => { if (readToken === fileReadToken) loadText(String(reader.result || ''), file.name); };
    reader.onerror = () => { if (readToken === fileReadToken) toast('Không thể đọc file. Vui lòng thử lại.'); };
    reader.readAsText(file, 'UTF-8');
  }
  $('chooseFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
  $('dropZone').addEventListener('dragover', (e) => { e.preventDefault(); $('dropZone').classList.add('drag'); });
  $('dropZone').addEventListener('dragleave', () => $('dropZone').classList.remove('drag'));
  $('dropZone').addEventListener('drop', (e) => { e.preventDefault(); $('dropZone').classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
  $('removeFile').addEventListener('click', () => {
    fileReadToken += 1;
    if (activeTranslationController) activeTranslationController.abort();
    fileName = ''; originalText = ''; chunks = []; cues = [];
    $('fileMeta').classList.remove('visible'); $('fileInput').value = '';
    $('cueList').innerHTML = ''; $('cueList').style.display = 'none'; $('emptyState').style.display = 'block';
    $('cueCount').textContent = 'Chưa có file'; $('downloadBtn').disabled = true;
    $('preserveNote').textContent = '🔒 Số thứ tự và mốc thời gian được khóa, không cho chỉnh sửa.';
    $('translateProgress').classList.remove('visible'); $('translateProgressSummary').classList.remove('visible');
    $('translateProgressFill').style.width = '0%'; $('translateProgressCount').textContent = '0/0 câu đã dịch'; $('translateProgressPercent').textContent = '0%';
  });
  function formatCueText(cue, value) {
    const normalized = String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, '\n');
    if (/^\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(normalized)) return null;
    const hasCrLf = cue.prefix.includes('\r\n') || cue.separator.includes('\r\n');
    const hasCrOnly = !hasCrLf && (cue.prefix.includes('\r') || cue.separator.includes('\r'));
    const lineEnding = hasCrLf ? '\r\n' : hasCrOnly ? '\r' : '\n';
    return normalized.replace(/\n/g, lineEnding);
  }
  $('downloadBtn').addEventListener('click', () => {
    if (!cues.length) return;
    let invalidCue = false;
    const output = chunks.map((chunk) => {
      if (!chunk.cue) return chunk.raw + chunk.separator;
      const cue = chunk.cue;
      const value = formatCueText(cue, cues[cue.id].translation);
      if (value === null) invalidCue = true;
      return cue.prefix + (value === null ? cues[cue.id].translation : value) + chunk.separator;
    }).join('');
    if (invalidCue) {
      toast('Một bản dịch có chứa dòng timestamp. Hãy sửa nội dung đó trước khi xuất để tránh hỏng cấu trúc SRT.');
      return;
    }
    const blob = new Blob([output], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = (fileName || 'subtitle.srt').replace(/\.srt$/i, '');
    a.href = url; a.download = `${base}_${$('targetLang').value.toLowerCase().replace(/\s+/g, '_')}.srt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Đã xuất file SRT. Số thứ tự và timestamp được giữ nguyên.');
  });
  $('loadSample').addEventListener('click', () => {
    const sample = '1\r\n00:00:01,000 --> 00:00:03,200\r\nI never thought we would meet again.\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,500\r\nBut here we are, standing in the rain.\r\n\r\n3\r\n00:00:07,100 --> 00:00:09,000\r\nAre you ready to go?\r\n';
    loadText(sample, 'demo-subtitles.srt');
  });
  document.querySelectorAll('.provider').forEach((button) => button.addEventListener('click', () => {
    const requestedProvider = button.dataset.provider;
    if (requestedProvider === 'openai' && !currentUser) {
      toast('Vui lòng đăng nhập Google để sử dụng OpenAI.');
      return;
    }
    provider = requestedProvider;
    document.querySelectorAll('.provider').forEach((item) => item.classList.toggle('active', item === button));
    $('keyLabel').textContent = provider === 'openai' ? 'OpenAI API key' : 'Google Gemini API key';
    $('apiKey').placeholder = provider === 'openai' ? 'sk-••••••••••••••••' : 'AIza••••••••••••••••';
    $('keyGuideLink').href = provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://aistudio.google.com/app/apikey';
    $('keyGuideLink').textContent = provider === 'openai' ? 'Hướng dẫn lấy OpenAI API key' : 'Hướng dẫn lấy Google Gemini API key';
    $('apiKey').value = loadSavedKey(provider);
    updateModelOptions();
  }));
  function savedKeyStorageName(providerName) { return 'sublingo_saved_api_key_' + providerName; }
  function loadSavedKey(providerName) {
    try { return localStorage.getItem(savedKeyStorageName(providerName)) || ''; }
    catch (_) { return ''; }
  }
  const thinkingLevelStorageKey = 'sublingo_gemini_thinking_level';
  const validThinkingLevels = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'];
  function loadSavedThinkingLevel() {
    try {
      const saved = localStorage.getItem(thinkingLevelStorageKey);
      return validThinkingLevels.includes(saved) ? saved : 'MINIMAL';
    } catch (_) {
      return 'MINIMAL';
    }
  }
  $('thinkingLevel').value = loadSavedThinkingLevel();
  $('thinkingLevel').addEventListener('change', () => {
    const selected = $('thinkingLevel').value;
    if (!validThinkingLevels.includes(selected)) {
      $('thinkingLevel').value = 'MINIMAL';
      return;
    }
    try { localStorage.setItem(thinkingLevelStorageKey, selected); }
    catch (_) { toast('Không thể lưu mức suy luận trong trình duyệt này.'); }
  });
  $('saveKeyBtn').addEventListener('click', () => {
    const key = $('apiKey').value.trim();
    if (!key) { toast('Hãy nhập API key trước khi lưu.'); $('apiKey').focus(); return; }
    try {
      localStorage.setItem(savedKeyStorageName(provider), key);
      toast('Đã lưu API key trên trình duyệt của thiết bị này.');
    } catch (_) {
      toast('Trình duyệt không cho phép lưu key. Hãy kiểm tra cài đặt bộ nhớ.');
    }
  });
  $('clearKeyBtn').addEventListener('click', () => {
    try {
      localStorage.removeItem(savedKeyStorageName(provider));
      $('apiKey').value = '';
      toast('Đã xóa API key đã lưu trên thiết bị này.');
    } catch (_) {
      toast('Không thể xóa key đã lưu trong trình duyệt.');
    }
  });
  $('toggleKey').addEventListener('click', () => {
    const input = $('apiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('toggleKey').textContent = input.type === 'password' ? 'Hiện' : 'Ẩn';
  });
  $('keyGuideLink').href = 'https://platform.openai.com/api-keys';
  $('apiKey').value = loadSavedKey(provider);

  let currentUser = null;
  let translating = false;
  let activeTranslationController = null;
  let activeApiKey = '';

  function updateModelOptions() {
    const selected = $('model').value;
    let options;
    if (provider === 'openai') {
      options = [
        ['gpt-6-luna', 'GPT-6 Luna · tiết kiệm'],
        ['gpt-6.1-terra', 'GPT-6.1 Terra']
      ];
    } else {
      options = [['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite · ưu tiên miễn phí']];
    }
    $('model').innerHTML = options.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('');
    if (options.some(([value]) => value === selected)) $('model').value = selected;
    $('thinkingLevel').disabled = provider !== 'gemini';
    $('thinkingLevelHelp').textContent = provider === 'gemini'
      ? 'MINIMAL nhanh và tiết kiệm nhất; LOW suy luận nhẹ; MEDIUM cân bằng; HIGH suy luận sâu hơn nhưng có thể chậm và dùng nhiều token hơn.'
      : 'Tùy chọn này chỉ áp dụng cho Gemini. Khi dùng OpenAI, mức suy luận do mô hình OpenAI xử lý riêng.';
  }

  function setLoggedIn(user) {
    currentUser = user || null;
    $('googleSignInButton').style.display = currentUser ? 'none' : 'flex';
    $('userState').classList.toggle('visible', !!currentUser);
    const openaiTab = document.querySelector('.provider[data-provider="openai"]');
    openaiTab.disabled = !currentUser;
    openaiTab.textContent = currentUser ? '✳ ChatGPT' : '✳ ChatGPT · cần đăng nhập';
    if (!currentUser && provider === 'openai') {
      document.querySelector('.provider[data-provider="gemini"]').click();
    } else {
      updateModelOptions();
    }
    const googleLoginConfigured = Boolean(window.SUBLINGO_CONFIG && window.SUBLINGO_CONFIG.googleClientId);
    $('translateHelp').textContent = currentUser
      ? 'Đã đăng nhập: bạn có thể dùng Gemini 3.5 Flash-Lite và OpenAI.'
      : googleLoginConfigured
        ? 'Chưa đăng nhập: có thể dùng Gemini 3.5 Flash-Lite. Đăng nhập để mở khóa OpenAI.'
        : 'Đăng nhập Google chưa được bật trên website. Hiện bạn vẫn có thể dùng Gemini 3.5 Flash-Lite.';
    if (currentUser) {
      $('userName').textContent = currentUser.name || currentUser.email || 'Đã đăng nhập';
      $('userAvatar').src = currentUser.picture || '';
      $('userAvatar').style.display = currentUser.picture ? 'block' : 'none';
    }
  }

  async function refreshSession() {
    try {
      const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      setLoggedIn(response.ok ? data.user : null);
    } catch (_) {
      setLoggedIn(null);
    }
  }

  async function googleCredentialCallback(response) {
    try {
      const result = await fetch('/api/auth/google', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Không thể đăng nhập Google.');
      setLoggedIn(data.user);
      toast('Đăng nhập Google thành công.');
    } catch (error) {
      toast(error.message || 'Đăng nhập Google thất bại.');
      // A failed attempt may already have consumed the one-time nonce.
      await initializeGoogleSignIn();
    }
  }

  async function initializeGoogleSignIn(retryCount = 0) {
    const clientId = window.SUBLINGO_CONFIG && window.SUBLINGO_CONFIG.googleClientId;
    if (!clientId) {
      $('googleSignInButton').innerHTML = '<span style="color:#FFE5B4;font-size:11px">Đăng nhập Google đang chờ cấu hình</span>';
      return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (retryCount < 20) {
        setTimeout(() => initializeGoogleSignIn(retryCount + 1), 400);
      } else {
        $('googleSignInButton').innerHTML = '<span style="color:#FFE5B4;font-size:11px">Không tải được đăng nhập Google</span>';
      }
      return;
    }
    try {
      $('googleSignInButton').innerHTML = '';
      const nonceResponse = await fetch('/api/auth/nonce', { credentials: 'same-origin', cache: 'no-store' });
      const nonceData = await nonceResponse.json();
      if (!nonceResponse.ok || !nonceData.nonce) throw new Error('Không khởi tạo được phiên Google.');
      window.google.accounts.id.initialize({ client_id: clientId, nonce: nonceData.nonce, callback: googleCredentialCallback, auto_select: false });
      window.google.accounts.id.renderButton($('googleSignInButton'), {
        type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular',
        logo_alignment: 'left', width: 190
      });
    } catch (error) {
      $('googleSignInButton').innerHTML = '<span style="color:#FFE5B4;font-size:11px">Không tải được đăng nhập Google</span>';
    }
  }

  function clearAppSecretsAndWorkspace() {
    // Xóa cả hai nhà cung cấp trước khi setLoggedIn(null) chuyển tab về Gemini.
    try {
      localStorage.removeItem('sublingo_saved_api_key_openai');
      localStorage.removeItem('sublingo_saved_api_key_gemini');
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('sublingo_')) sessionStorage.removeItem(key);
      }
    } catch (_) { /* Storage may be blocked by the browser. */ }
    $('apiKey').value = '';
    if (sttXhr) sttXhr.abort();
    sttXhr = null;
    $('sttApiKey').value = '';
    $('sttRememberKey').checked = false;
    clearSttVideo();
    $('apiKey').type = 'password';
    $('toggleKey').textContent = 'Hiện';
    activeApiKey = '';
    if (activeTranslationController) activeTranslationController.abort();
    activeTranslationController = null;
    // Xóa phụ đề đã tải và nội dung tạm trên giao diện.
    $('removeFile').click();
  }

  $('logoutBtn').addEventListener('click', async () => {
    clearAppSecretsAndWorkspace();
    setLoggedIn(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Logout request failed');
      toast('Đã đăng xuất và xóa API key đã lưu trên thiết bị này.');
    } catch (_) {
      toast('Đã xóa API key trên thiết bị, nhưng chưa xác nhận được phiên đăng xuất từ máy chủ.');
    } finally {
      // Google nonce is one-time and was consumed during the previous sign-in.
      // Fetch a fresh nonce so the next sign-in after logout can be verified.
      initializeGoogleSignIn();
    }
  });

  function waitFor(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Translation cancelled', 'AbortError'));
      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(new DOMException('Translation cancelled', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function translateAll() {
    if (translating) return;
    if (!cues.length) { toast('Hãy tải file SRT lên trước khi dịch.'); return; }
    if (!currentUser && provider === 'openai') { toast('Vui lòng đăng nhập Google để sử dụng OpenAI.'); return; }
    if (!currentUser && $('model').value !== 'gemini-3.5-flash-lite') {
      toast('Chưa đăng nhập chỉ được dùng Gemini 3.5 Flash-Lite.');
      return;
    }
    const oversizedCue = cues.find((cue) => !cue.translated && cue.source.length > 5000);
    if (oversizedCue) {
      toast('Câu phụ đề ' + (oversizedCue.id + 1) + ' dài hơn giới hạn 5.000 ký tự. Hãy rút ngắn câu đó rồi dịch lại.');
      return;
    }
    const apiKey = $('apiKey').value.trim();
    if (!apiKey) { toast('Bạn cần nhập API key trong phần thiết lập.'); $('apiKey').focus(); return; }

    const requestProvider = provider;
    const requestModel = $('model').value;
    const requestSourceLang = $('sourceLang').value;
    const requestTargetLang = $('targetLang').value;
    const requestStyle = $('style').value;
    const requestThinkingLevel = $('thinkingLevel').value;
    const requestController = new AbortController();
    activeTranslationController = requestController;
    const requestSignal = requestController.signal;
    activeApiKey = apiKey;
    translating = true;
    document.querySelectorAll('.cue-text.translation').forEach((field) => { field.disabled = true; });
    const button = $('translateBtn');
    const progress = $('translateProgress');
    const fill = $('translateProgressFill');
    const summary = $('translateProgressSummary');
    const batchSize = 60;
    const maxBatchChars = 24000;
    const total = cues.length;
    const failedRanges = [];
    const failureMessages = [];
    const updateProgress = () => {
      const done = cues.filter((cue) => cue.translated).length;
      const percent = Math.round((done / total) * 100);
      fill.style.width = percent + '%';
      progress.setAttribute('aria-valuenow', String(percent));
      $('translateProgressCount').textContent = done + '/' + total + ' câu đã dịch';
      $('translateProgressPercent').textContent = percent + '% · còn ' + (total - done) + ' câu';
    };
    button.disabled = true;
    progress.classList.add('visible');
    summary.classList.add('visible');
    updateProgress();

    const maxAttempts = requestProvider === 'gemini' ? 4 : 3;
    const geminiMinIntervalMs = 4500;
    let lastGeminiRequestAt = 0;
    let pendingRetryDelayMs = 0;
    try {
      let cursor = 0;
      while (cursor < cues.length) {
        const batch = [];
        let batchCharacters = 0;
        while (cursor < cues.length && batch.length < batchSize) {
          const cue = cues[cursor];
          if (cue.translated) {
            cursor += 1;
            continue;
          }
          if (batch.length && batchCharacters + cue.source.length > maxBatchChars) break;
          batch.push({ id: cue.id, text: cue.source });
          batchCharacters += cue.source.length;
          cursor += 1;
        }
        if (!batch.length) continue;
        const batchStart = batch[0].id + 1;
        const batchEnd = batch[batch.length - 1].id + 1;
        let lastError = null;
        let succeeded = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            let waitMs = pendingRetryDelayMs;
            pendingRetryDelayMs = 0;
            if (requestProvider === 'gemini' && lastGeminiRequestAt > 0) {
              const elapsed = Date.now() - lastGeminiRequestAt;
              waitMs = Math.max(waitMs, geminiMinIntervalMs - elapsed);
            }
            if (waitMs > 0) {
              button.textContent = 'Đang chờ giới hạn gửi yêu cầu của Gemini...';
              await waitFor(waitMs, requestSignal);
            }
            if (requestSignal.aborted) throw new DOMException('Translation cancelled', 'AbortError');
            if (requestProvider === 'gemini') lastGeminiRequestAt = Date.now();
            const response = await fetch('/api/translate', {
              method: 'POST', credentials: 'same-origin', signal: requestSignal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider: requestProvider, apiKey: activeApiKey, model: requestModel,
                sourceLang: requestSourceLang, targetLang: requestTargetLang, style: requestStyle,
                ...(requestProvider === 'gemini' ? { thinkingLevel: requestThinkingLevel } : {}),
                cues: batch
              })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              const requestError = new Error(data.error || 'Lỗi khi dịch phụ đề.');
              requestError.status = response.status;
              requestError.retryAfterMs = Number(data.retryAfterMs) || 0;
              requestError.quotaType = data.quotaType || '';
              throw requestError;
            }
            const byId = new Map((data.translations || []).map((item) => [item.id, item.text]));
            for (const cue of batch) if (!byId.has(cue.id) || typeof byId.get(cue.id) !== 'string') throw new Error('AI trả về thiếu câu phụ đề.');
            for (const cue of batch) {
              cues[cue.id].translation = byId.get(cue.id);
              cues[cue.id].translated = true;
            }
            succeeded = true; updateProgress(); break;
          } catch (error) {
            if (requestSignal.aborted || error.name === 'AbortError') throw new DOMException('Translation cancelled', 'AbortError');
            lastError = error;
            const retryableStatuses = [408, 429, 500, 502, 503, 504];
            const isNetworkFailure = !Number.isInteger(error.status) && (error.name === 'TypeError' || /timeout|network/i.test(error.message || ''));
            const canRetry = retryableStatuses.includes(error.status) || isNetworkFailure;
            if (error.quotaType === 'daily') throw error;
            if (!canRetry) throw error;
            if (attempt < maxAttempts) {
              const fallbackRetryDelaysMs = [1000, 5000, 10000];
              const retryBaseDelayMs = Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0
                ? Math.min(10000, error.retryAfterMs)
                : fallbackRetryDelaysMs[Math.min(attempt - 1, fallbackRetryDelaysMs.length - 1)];
              const retryJitterMs = requestProvider === 'gemini' ? Math.floor(Math.random() * 1000) : 0;
              pendingRetryDelayMs = retryBaseDelayMs + retryJitterMs;
              button.textContent = (requestProvider === 'gemini' ? 'Gemini' : 'OpenAI') + ' tạm bận · chờ tối đa ' + Math.ceil(pendingRetryDelayMs / 1000) + ' giây rồi thử lại...';
            }
          }
        }
        if (!succeeded) {
          failedRanges.push(batchStart + '-' + batchEnd);
          if (lastError?.message && !failureMessages.includes(lastError.message)) failureMessages.push(lastError.message);
          console.warn('Subtitle batch failed after retries:', failedRanges[failedRanges.length - 1], lastError);
        }
        renderCues(); updateProgress();
        if (!succeeded && (lastError?.status === 429 || lastError?.status === 503)) break;
        button.textContent = 'Đã xử lý đến ' + batchEnd + '/' + total + '...';
      }
      if (requestSignal.aborted) throw new DOMException('Translation cancelled', 'AbortError');
      const untranslatedCues = cues.filter((cue) => !cue.translated);
      const remaining = untranslatedCues.length;
      if (remaining) {
        const remainingRanges = [];
        let rangeStart = null;
        let rangeEnd = null;
        for (const cue of untranslatedCues) {
          const cueNumber = cue.id + 1;
          if (rangeStart === null) { rangeStart = cueNumber; rangeEnd = cueNumber; }
          else if (cueNumber === rangeEnd + 1) rangeEnd = cueNumber;
          else { remainingRanges.push(rangeStart === rangeEnd ? String(rangeStart) : rangeStart + '-' + rangeEnd); rangeStart = cueNumber; rangeEnd = cueNumber; }
        }
        if (rangeStart !== null) remainingRanges.push(rangeStart === rangeEnd ? String(rangeStart) : rangeStart + '-' + rangeEnd);
        const overloadHint = failureMessages.some((message) => message.includes('(503)'))
          ? ' Gemini đang tạm quá tải; SubLingo đã dừng gửi các nhóm còn lại để tránh gọi dồn. Hãy đợi ít phút rồi thử lại.'
          : failureMessages.length && /429|giới hạn tốc độ|hạn mức/.test(failureMessages[0])
            ? ' Google đang giới hạn lượt gọi. Hãy chờ rồi thử lại.'
            : ' Bấm dịch lại để thử các câu còn thiếu.';
        toast('Đã dịch ' + (total - remaining) + '/' + total + ' câu. Các câu chưa dịch: ' + remainingRanges.join(', ') + (failureMessages.length ? '. Nguyên nhân: ' + failureMessages[0] + '.' : '.') + overloadHint);
      } else toast('Đã dịch xong ' + total + ' câu. Hãy rà soát trước khi tải file.');
    } catch (error) {
      renderCues();
      if (error.name !== 'AbortError') toast(error.message || 'Có lỗi khi dịch. Vui lòng thử lại.');
    } finally {
      translating = false;
      activeApiKey = '';
      if (activeTranslationController === requestController) activeTranslationController = null;
      document.querySelectorAll('.cue-text.translation').forEach((field) => { field.disabled = false; });
      button.disabled = false;
      button.textContent = '✦ Dịch phụ đề bằng AI';
    }
  }

  $('translateBtn').addEventListener('click', translateAll);


  function formatSttClock(seconds) {
    const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(secs).padStart(2, '0') + ',' +
      String(millis).padStart(3, '0');
  }

  function formatSttFileSize(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function resetSttSteps() {
    ['sttStepExtract', 'sttStepRecognize', 'sttStepNormalize', 'sttStepAlign'].forEach((id) => {
      $(id).classList.remove('active', 'done');
    });
  }

  function updateSttProgress(stage, percent, message) {
    const stageOrder = ['extracting', 'recognizing', 'normalizing', 'aligning'];
    const currentIndex = stageOrder.indexOf(stage);
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    $('sttProgress').classList.remove('is-hidden');
    $('sttProgressStatus').textContent = message || 'Đang xử lý video...';
    $('sttProgressPercent').textContent = Math.round(safePercent) + '%';
    $('sttProgressTrack').setAttribute('aria-valuenow', String(Math.round(safePercent)));
    $('sttProgressTrack').setAttribute('aria-valuetext', Math.round(safePercent) + ' phần trăm. ' + (message || 'Đang xử lý video...'));
    $('sttProgressFill').style.width = safePercent + '%';
    const ids = ['sttStepExtract', 'sttStepRecognize', 'sttStepNormalize', 'sttStepAlign'];
    ids.forEach((id, index) => {
      $(id).classList.toggle('done', currentIndex >= 0 && index < currentIndex);
      $(id).classList.toggle('active', currentIndex === index);
    });
    if (stage === 'done') {
      ids.forEach((id) => {
        $(id).classList.remove('active');
        $(id).classList.add('done');
      });
    }
  }

  function sttPaginationSafeReset() {
    const pagination = $('sttPagination');
    if (pagination) pagination.classList.add('is-hidden');
    if ($('sttPrevPage')) $('sttPrevPage').disabled = true;
    if ($('sttNextPage')) $('sttNextPage').disabled = true;
  }

  function clearSttVideo() {
    if (sttXhr) sttXhr.abort();
    sttXhr = null;
    if (sttObjectUrl) URL.revokeObjectURL(sttObjectUrl);
    sttObjectUrl = '';
    sttVideoFile = null;
    sttCaptions = [];
    sttCaptionPage = 0;
    sttPaginationSafeReset();
    sttLastOverlayCueId = null;
    const video = $('sttVideoPreview');
    video.pause();
    video.removeAttribute('src');
    video.load();
    $('sttVideoStage').classList.remove('has-video');
    $('sttFileMeta').classList.add('is-hidden');
    $('sttFileName').textContent = 'Chưa chọn video';
    $('sttFileSize').textContent = '';
    $('sttStartBtn').disabled = true;
    $('sttClearVideo').disabled = false;
    $('sttCancelBtn').classList.add('is-hidden');
    $('sttResetBtn').disabled = true;
    $('sttDownloadBtn').disabled = true;
    $('sttWordCount').textContent = 'Chưa có kết quả';
    $('sttCaptionMeta').textContent = 'Chưa có câu nào';
    $('sttCaptionList').innerHTML = '<div class="stt-caption-empty">Sau khi AI xử lý video, từng câu phụ đề sẽ hiển thị ở đây để bạn chỉnh sửa.</div>';
    $('sttPreviewCaption').textContent = '';
    $('sttPreviewCaption').classList.remove('visible', 'fade');
    $('sttProgress').classList.add('is-hidden');
    $('sttProgressFill').style.width = '0%';
    $('sttTimeOffset').value = '0';
    $('sttProgressPercent').textContent = '0%';
    $('sttProgressTrack').setAttribute('aria-valuenow', '0');
    $('sttProgressTrack').setAttribute('aria-valuetext', '0 phần trăm');
    $('sttProgressStatus').textContent = 'Đang chuẩn bị...';
    resetSttSteps();
  }

  function chooseSttVideo(file) {
    if (!file) return;
    const allowed = /\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg)$/i;
    if (!allowed.test(file.name)) {
      toast('Định dạng video chưa được hỗ trợ. Hãy chọn MP4, MOV, MKV, WebM hoặc AVI.');
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      toast('Video vượt quá 150 MB. Hãy nén video hoặc chọn đoạn ngắn hơn.');
      return;
    }
    clearSttVideo();
    sttVideoFile = file;
    sttObjectUrl = URL.createObjectURL(file);
    $('sttVideoPreview').src = sttObjectUrl;
    $('sttVideoStage').classList.add('has-video');
    $('sttFileMeta').classList.remove('is-hidden');
    $('sttFileName').textContent = file.name;
    $('sttFileSize').textContent = formatSttFileSize(file.size);
    $('sttStartBtn').disabled = false;
    toast('Đã nhận video. Hãy kiểm tra API key và chọn ngôn ngữ trước khi tạo phụ đề.');
  }

  $('sttVideoInput').addEventListener('change', (event) => {
    chooseSttVideo(event.target.files[0]);
    event.target.value = '';
  });
  $('sttDropZone').addEventListener('dragover', (event) => {
    event.preventDefault();
    $('sttDropZone').classList.add('drag');
  });
  $('sttDropZone').addEventListener('dragleave', () => $('sttDropZone').classList.remove('drag'));
  $('sttDropZone').addEventListener('drop', (event) => {
    event.preventDefault();
    $('sttDropZone').classList.remove('drag');
    chooseSttVideo(event.dataTransfer.files[0]);
  });
  $('sttClearVideo').addEventListener('click', clearSttVideo);

  $('sttApiKey').value = loadSavedKey('gemini');
  $('sttRememberKey').checked = Boolean($('sttApiKey').value);
  $('sttToggleKey').addEventListener('click', () => {
    const input = $('sttApiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('sttToggleKey').textContent = input.type === 'password' ? 'Hiện' : 'Ẩn';
  });
  $('sttRememberKey').addEventListener('change', () => {
    try {
      if ($('sttRememberKey').checked) {
        const key = $('sttApiKey').value.trim();
        if (key) localStorage.setItem(savedKeyStorageName('gemini'), key);
      } else {
        localStorage.removeItem(savedKeyStorageName('gemini'));
      }
    } catch (_) {
      toast('Trình duyệt không cho phép lưu API key.');
    }
  });

  function applySttPreviewStyle() {
    const caption = $('sttPreviewCaption');
    caption.style.fontSize = $('sttFontSize').value + 'px';
    caption.style.color = $('sttTextColor').value;
    caption.classList.toggle('fade', $('sttCaptionEffect').value === 'fade');
    $('sttFontSizeValue').textContent = $('sttFontSize').value + 'px';
  }
  $('sttFontSize').addEventListener('input', applySttPreviewStyle);
  $('sttTextColor').addEventListener('input', applySttPreviewStyle);
  $('sttCaptionEffect').addEventListener('change', applySttPreviewStyle);
  applySttPreviewStyle();

  function getSttTimeOffset() {
    const value = Number($('sttTimeOffset').value);
    return Number.isFinite(value) ? Math.max(-600, Math.min(600, value)) : 0;
  }
  function updateSttTimeLabels() {
    const offset = getSttTimeOffset();
    document.querySelectorAll('.stt-caption-time').forEach((button) => {
      const cue = sttCaptions[Number(button.dataset.cueIndex)];
      if (cue) button.textContent = formatSttClock(cue.start + offset) + '\n' + formatSttClock(cue.end + offset);
    });
    updateSttVideoCaption();
  }
  $('sttTimeOffset').addEventListener('input', updateSttTimeLabels);

  function updateSttVideoCaption() {
    const video = $('sttVideoPreview');
    const caption = $('sttPreviewCaption');
    const time = (video.currentTime || 0) - getSttTimeOffset();
    let low = 0;
    let high = sttCaptions.length - 1;
    let candidate = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (sttCaptions[middle].start <= time) { candidate = middle; low = middle + 1; }
      else high = middle - 1;
    }
    const possible = candidate >= 0 ? sttCaptions[candidate] : null;
    const active = possible && time <= possible.end && possible.text.trim() ? possible : null;
    if (!active) {
      caption.textContent = '';
      caption.classList.remove('visible');
      sttLastOverlayCueId = null;
      return;
    }
    caption.textContent = active.text;
    caption.classList.add('visible');
    if (sttLastOverlayCueId !== active.id) {
      caption.classList.remove('fade');
      void caption.offsetWidth;
      if ($('sttCaptionEffect').value === 'fade') caption.classList.add('fade');
      sttLastOverlayCueId = active.id;
    }
  }
  $('sttVideoPreview').addEventListener('timeupdate', updateSttVideoCaption);
  $('sttVideoPreview').addEventListener('seeked', updateSttVideoCaption);

  function renderSttCaptions() {
    const list = $('sttCaptionList');
    list.replaceChildren();
    if (!sttCaptions.length) {
      list.innerHTML = '<div class="stt-caption-empty">Chưa có câu phụ đề để hiển thị.</div>';
      $('sttPagination').classList.add('is-hidden');
      $('sttDownloadBtn').disabled = true;
      $('sttResetBtn').disabled = true;
      $('sttCaptionMeta').textContent = 'Chưa có câu nào';
      return;
    }
    const pageCount = Math.ceil(sttCaptions.length / STT_CAPTION_PAGE_SIZE);
    sttCaptionPage = Math.max(0, Math.min(sttCaptionPage, pageCount - 1));
    const firstIndex = sttCaptionPage * STT_CAPTION_PAGE_SIZE;
    const endIndex = Math.min(sttCaptions.length, firstIndex + STT_CAPTION_PAGE_SIZE);
    const timeOffset = getSttTimeOffset();
    for (let index = firstIndex; index < endIndex; index += 1) {
      const cue = sttCaptions[index];
      const row = document.createElement('div');
      row.className = 'stt-caption-row';
      const timeButton = document.createElement('button');
      timeButton.type = 'button';
      timeButton.className = 'stt-caption-time';
      timeButton.dataset.cueIndex = String(index);
      timeButton.textContent = formatSttClock(cue.start + timeOffset) + '\n' + formatSttClock(cue.end + timeOffset);
      timeButton.title = 'Tua video đến câu này';
      timeButton.addEventListener('click', () => {
        $('sttVideoPreview').currentTime = Math.max(0, cue.start + getSttTimeOffset());
        $('sttVideoPreview').play().catch(() => {});
      });
      const textInput = document.createElement('textarea');
      textInput.rows = 2;
      textInput.value = cue.text;
      textInput.setAttribute('aria-label', 'Chỉnh sửa câu phụ đề ' + (index + 1));
      textInput.addEventListener('input', () => {
        cue.text = textInput.value;
        updateSttVideoCaption();
      });
      row.append(timeButton, textInput);
      list.append(row);
    }
    $('sttPagination').classList.toggle('is-hidden', pageCount <= 1);
    $('sttPrevPage').disabled = sttCaptionPage <= 0;
    $('sttNextPage').disabled = sttCaptionPage >= pageCount - 1;
    $('sttPageLabel').textContent = 'Trang ' + (sttCaptionPage + 1) + '/' + pageCount + ' · ' + (firstIndex + 1) + '–' + endIndex + '/' + sttCaptions.length + ' câu';
    $('sttCaptionMeta').textContent = sttCaptions.length + ' câu phụ đề';
    $('sttDownloadBtn').disabled = false;
    $('sttResetBtn').disabled = false;
    $('sttWordCount').textContent = sttCaptions.length + ' câu · ' + (window.sttWordCount || 0) + ' từ';
    updateSttVideoCaption();
  }
  $('sttPrevPage').addEventListener('click', () => {
    if (sttCaptionPage <= 0) return;
    sttCaptionPage -= 1;
    renderSttCaptions();
  });
  $('sttNextPage').addEventListener('click', () => {
    if ((sttCaptionPage + 1) * STT_CAPTION_PAGE_SIZE >= sttCaptions.length) return;
    sttCaptionPage += 1;
    renderSttCaptions();
  });

  function requestSttTranscription(formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      sttXhr = xhr;
      let cursor = 0;
      let buffer = '';
      let finalResult = null;
      let serverError = '';

      const readEvents = (final) => {
        const responseText = xhr.responseText || '';
        buffer += responseText.slice(cursor);
        cursor = responseText.length;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        const handleLine = (line) => {
          if (!line.trim()) return;
          let event;
          try { event = JSON.parse(line); }
          catch (_) { return; }
          if (event.type === 'progress') {
            updateSttProgress(event.stage, event.percent, event.message);
          } else if (event.type === 'done') {
            finalResult = event.result;
          } else if (event.type === 'error') {
            serverError = event.error || 'Không thể tạo phụ đề lúc này.';
          } else if (event.error) {
            serverError = event.error;
          }
        };
        lines.forEach(handleLine);
        if (final && buffer.trim()) handleLine(buffer);
      };

      xhr.open('POST', '/api/transcribe');
      xhr.setRequestHeader('Accept', 'application/x-ndjson');
      xhr.timeout = 15 * 60 * 1000;
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 18);
          $('sttProgress').classList.remove('is-hidden');
          $('sttProgressStatus').textContent = 'Đang tải video lên máy chủ...';
          $('sttProgressPercent').textContent = percent + '%';
          $('sttProgressFill').style.width = percent + '%';
        } else {
          $('sttProgressStatus').textContent = 'Đang tải video lên máy chủ...';
        }
      });
      xhr.onprogress = () => readEvents(false);
      xhr.onload = () => {
        readEvents(true);
        sttXhr = null;
        if (serverError) return reject(new Error(serverError));
        if (finalResult) return resolve(finalResult);
        if (xhr.status >= 200 && xhr.status < 300) {
          return reject(new Error('Máy chủ chưa trả về kết quả phụ đề hợp lệ.'));
        }
        let message = 'Không thể xử lý video. Vui lòng thử lại.';
        try { message = JSON.parse(xhr.responseText).error || message; } catch (_) {}
        reject(new Error(message));
      };
      xhr.onerror = () => { sttXhr = null; reject(new Error('Mất kết nối khi tải video hoặc nhận kết quả.')); };
      xhr.ontimeout = () => { sttXhr = null; reject(new Error('Yêu cầu xử lý video đã quá thời gian chờ. Hãy thử video ngắn hơn.')); };
      xhr.onabort = () => { sttXhr = null; reject(new DOMException('Đã hủy tạo phụ đề.', 'AbortError')); };
      xhr.send(formData);
    });
  }

  function setSttBusy(busy) {
    $('sttStartBtn').disabled = busy || !sttVideoFile;
    $('sttCancelBtn').classList.toggle('is-hidden', !busy);
    $('sttClearVideo').disabled = busy;
    $('sttDropZone').style.pointerEvents = busy ? 'none' : '';
    $('sttVideoInput').disabled = busy;
    $('sttLanguage').disabled = busy;
    $('sttApiKey').disabled = busy;
    $('sttCorrections').disabled = busy;
    $('sttCleanDisfluencies').disabled = busy;
    $('sttTimeOffset').disabled = busy;
  }

  async function startSttTranscription() {
    if (!sttVideoFile) {
      toast('Hãy chọn video trước khi tạo phụ đề.');
      return;
    }
    const apiKey = $('sttApiKey').value.trim();
    if (!apiKey) {
      toast('Hãy nhập Google Gemini API key hoặc lưu key ở Trang 1.');
      $('sttApiKey').focus();
      return;
    }
    try {
      if ($('sttRememberKey').checked) localStorage.setItem(savedKeyStorageName('gemini'), apiKey);
      else localStorage.removeItem(savedKeyStorageName('gemini'));
    } catch (_) {
      toast('Không thể cập nhật tùy chọn lưu API key trong trình duyệt.');
    }

    sttCaptions = [];
    sttCaptionPage = 0;
    window.sttWordCount = 0;
    $('sttTimeOffset').value = '0';
    $('sttCaptionList').innerHTML = '<div class="stt-caption-empty">AI đang xử lý video. Danh sách phụ đề sẽ xuất hiện sau khi hoàn tất.</div>';
    $('sttDownloadBtn').disabled = true;
    $('sttResetBtn').disabled = true;
    $('sttWordCount').textContent = 'Đang xử lý...';
    $('sttCaptionMeta').textContent = 'Đang nhận diện giọng nói';
    resetSttSteps();
    $('sttProgress').classList.remove('is-hidden');
    updateSttProgress('uploading', 0, 'Đang chuẩn bị tải video...');
    setSttBusy(true);

    const form = new FormData();
    form.append('video', sttVideoFile, sttVideoFile.name);
    form.append('apiKey', apiKey);
    form.append('language', $('sttLanguage').value);
    form.append('corrections', $('sttCorrections').value);
    form.append('cleanDisfluencies', $('sttCleanDisfluencies').checked ? 'true' : 'false');

    try {
      const result = await requestSttTranscription(form);
      sttCaptions = Array.isArray(result.cues) ? result.cues : [];
      window.sttWordCount = Number(result.wordCount) || 0;
      if (!sttCaptions.length) throw new Error('AI không trả về câu phụ đề nào.');
      renderSttCaptions();
      updateSttProgress('done', 100, 'Đã tạo xong phụ đề. Bạn có thể sửa câu và tải file SRT.');
      $('sttCaptionMeta').textContent = sttCaptions.length + ' câu · Ngôn ngữ: ' + (result.language || 'tự động');
      toast('Đã tạo ' + sttCaptions.length + ' câu phụ đề. Hãy rà soát trước khi tải SRT.');
    } catch (error) {
      if (error.name === 'AbortError') {
        toast(error.message || 'Đã hủy xử lý video.');
      } else {
        toast(error.message || 'Không thể tạo phụ đề lúc này.');
        $('sttProgressStatus').textContent = 'Có lỗi khi xử lý video.';
        $('sttCaptionMeta').textContent = 'Chưa có kết quả';
      }
    } finally {
      setSttBusy(false);
      sttXhr = null;
    }
  }
  $('sttStartBtn').addEventListener('click', startSttTranscription);
  $('sttCancelBtn').addEventListener('click', () => {
    if (sttXhr) sttXhr.abort();
  });

  function makeSttSrt(captions, offset = 0) {
    return captions.map((cue, index) => {
      const text = String(cue.text || '').replace(/\r\n?/g, '\n').trim();
      return (index + 1) + '\n' + formatSttClock(cue.start + offset) + ' --> ' + formatSttClock(cue.end + offset) + '\n' + text;
    }).join('\n\n') + '\n';
  }

  $('sttDownloadBtn').addEventListener('click', () => {
    const valid = sttCaptions.filter((cue) => String(cue.text || '').trim());
    if (!valid.length) {
      toast('Chưa có nội dung phụ đề để xuất.');
      return;
    }
    const blob = new Blob(['\uFEFF' + makeSttSrt(valid, getSttTimeOffset())], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const base = (sttVideoFile?.name || 'video').replace(/\.[^.]+$/, '');
    anchor.href = url;
    anchor.download = base + '_auto.srt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Đã tải phụ đề SRT tự động.');
  });

  $('sttResetBtn').addEventListener('click', () => {
    sttCaptions = [];
    sttCaptionPage = 0;
    window.sttWordCount = 0;
    $('sttPagination').classList.add('is-hidden');
    $('sttCaptionList').innerHTML = '<div class="stt-caption-empty">Đã xóa kết quả. Bạn có thể tạo phụ đề lại từ video hiện tại.</div>';
    $('sttPreviewCaption').textContent = '';
    $('sttPreviewCaption').classList.remove('visible');
    $('sttWordCount').textContent = 'Đã xóa kết quả';
    $('sttCaptionMeta').textContent = 'Chưa có câu nào';
    $('sttDownloadBtn').disabled = true;
    $('sttResetBtn').disabled = true;
  });


 refreshSession();
  initializeGoogleSignIn();
  $('targetLang').addEventListener('change', () => {
    document.querySelectorAll('.cue-content.translation-col .timecode').forEach((el) => { el.textContent = $('targetLang').value; });
  });
})();
