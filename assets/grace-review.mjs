import { loadBrowserScript } from './browser-dependency.mjs';
import { publicConfig } from './grace-public-config.mjs';
import { fitGraceViewport } from './grace-viewport.mjs';
import { sampleAnswer, sampleFiles } from './grace-review-samples.mjs';

const get = id => document.getElementById('review-' + id);
const signIn = get('sign-in');
const workspace = get('workspace');
const status = get('status');
const question = get('question');
const panels = [...workspace.querySelectorAll('[data-review-panel]')];
const navigation = [...workspace.querySelectorAll('[data-review-view]')];
const sampleQuestion = '示例门的标准尺寸是多少？ / What are the sample door dimensions?';
let auth;
let spaces;
let space;
let conversation;
let attached = false;
let reading;
let page = 0;
let downloadUrl;
let microphone;
let microphonePending = false;
let microphoneAttempt = 0;

fitGraceViewport(document.body);

async function reviewAuth() {
  if (auth) return auth;
  const { createClient } = await loadBrowserScript('./assets/vendor/supabase-2.57.4.js', {
    select: () => window.supabase?.createClient ? window.supabase : null,
  });
  ({ auth } = createClient(`https://${publicConfig.projectRef}.supabase.co`, publicConfig.anonKey, {
    auth: {
      storageKey: 'grace-play-review',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }));
  return auth;
}

function selectView(view) {
  for (const panel of panels) panel.hidden = panel.dataset.reviewPanel !== view;
  for (const button of navigation) button.setAttribute('aria-pressed', String(button.dataset.reviewView === view));
  if (view !== 'chat') {
    get('voice').pause();
    stopMicrophone();
  }
  if (view === 'history') renderHistory();
}

function setAttachment(value) {
  attached = value;
  get('attachment').hidden = !value;
}

function stopMicrophone() {
  microphoneAttempt += 1;
  for (const track of microphone?.getTracks() ?? []) track.stop();
  microphone = undefined;
  microphonePending = false;
  get('mic').disabled = false;
  get('mic').setAttribute('aria-pressed', 'false');
  get('mic').textContent = '测试麦克风 / Test microphone';
}

async function toggleMicrophone() {
  const message = get('mic-status');
  const button = get('mic');
  if (microphone) {
    stopMicrophone();
    message.textContent = '麦克风已停止 / Microphone stopped';
    return;
  }
  if (microphonePending) return;
  microphonePending = true;
  const attempt = ++microphoneAttempt;
  button.disabled = true;
  message.textContent = '正在请求权限 / Requesting permission…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (attempt !== microphoneAttempt || workspace.hidden) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    microphone = stream;
    button.setAttribute('aria-pressed', 'true');
    button.textContent = '停止麦克风 / Stop microphone';
    message.textContent = '麦克风已连接 / Microphone connected';
  } catch {
    if (attempt === microphoneAttempt) message.textContent = '麦克风不可用 / Microphone unavailable';
  } finally {
    if (attempt === microphoneAttempt) {
      microphonePending = false;
      button.disabled = false;
    }
  }
}

async function pickSampleImage(event) {
  const field = event.target;
  const file = field.files[0];
  field.value = '';
  if (!file || workspace.hidden) return;
  const currentSpaces = spaces;
  const expectedName = 'grace-review-sample-door.svg';
  // Only the bundled synthetic image can become a review attachment.
  const sampleDigest = '3b43ba7bb47cafc1d40c8e926eb8e432512aae0c9fd6a857ecd03849913a8998';
  let allowed = false;
  if (file.name === expectedName && file.size < 32768) {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    allowed = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') === sampleDigest;
  }
  if (workspace.hidden || spaces !== currentSpaces) return;
  if (allowed) setAttachment(true);
  get('image-status').textContent = allowed
    ? '已附上示例图 / Sample image attached'
    : '请选择演示提供的示例图 / Choose the image provided in the demo';
}

function buttonItem(label, onClick) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  row.append(button);
  return row;
}

function renderChat() {
  get('messages').replaceChildren(...conversation.map(turn => {
    const row = document.createElement('li');
    const prompt = document.createElement('strong');
    prompt.textContent = turn.question;
    const response = document.createElement('p');
    const file = sampleFiles.find(entry => entry.id === turn.answer?.file);
    response.textContent = file?.pages[turn.answer.page]
      ?? '可以询问示例门的尺寸、颜色和安装流程。 Ask about the sample door dimensions, colours, or installation.';
    row.append(prompt, response);
    if (file) {
      const source = document.createElement('button');
      source.type = 'button';
      source.textContent = `${file.title} · p. ${turn.answer.page + 1}`;
      source.addEventListener('click', () => openFile(file, turn.answer.page));
      row.append(source);
    }
    return row;
  }));
}

function renderHistory() {
  const history = get('history');
  const entries = [...spaces[space]].reverse();
  history.replaceChildren(...entries.map(turns => buttonItem(turns[0].question, () => {
    conversation = turns;
    setAttachment(false);
    renderChat();
    selectView('chat');
  })));
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.textContent = '暂无示例记录 / No demo conversations yet';
    history.append(empty);
  }
}

function startChat() {
  conversation = [];
  question.reset();
  setAttachment(false);
  renderChat();
  selectView('chat');
}

function selectSpace(next) {
  space = next;
  get('space').value = next;
  get('scope').textContent = next === 'enterprise'
    ? '企业空间演示 · 示例资料 / Enterprise demo · sample content'
    : '个人空间演示 · 示例体验 / Personal demo · sample content';
  get('reader').hidden = true;
  startChat();
}

function renderFiles() {
  const query = get('file-filter').value.trim().toLowerCase();
  const matches = sampleFiles.filter(file => file.title.toLowerCase().includes(query));
  get('files').replaceChildren(...matches.map(file => buttonItem(file.title, () => openFile(file, 0))));
}

function renderFilePage() {
  get('file-title').textContent = reading.title;
  get('file-page').textContent = `Page ${page + 1} of ${reading.pages.length}`;
  get('preview').textContent = reading.pages[page];
  get('prev-page').disabled = page === 0;
  get('next-page').disabled = page + 1 === reading.pages.length;
}

function openFile(file, position) {
  reading = file;
  page = position;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  const contents = [file.title, 'Synthetic review materials',
    ...file.pages.map((text, i) => `Page ${i + 1}\n${text}`)].join('\n\n');
  downloadUrl = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
  get('download').href = downloadUrl;
  get('download').download = file.filename;
  renderFilePage();
  get('reader').hidden = false;
  selectView('files');
}

function showSample() {
  spaces = { enterprise: [], personal: [] };
  renderFiles();
  selectSpace('enterprise');
  signIn.hidden = true;
  workspace.hidden = false;
}

function resetWorkspace() {
  get('voice').pause();
  stopMicrophone();
  get('mic-status').textContent = '';
  get('image-status').textContent = '';
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
  get('download').removeAttribute('href');
  get('messages').replaceChildren();
  get('history').replaceChildren();
  get('light').checked = false;
  document.body.classList.remove('review-light');
  spaces = undefined;
  conversation = undefined;
  setAttachment(false);
  question.reset();
  workspace.hidden = true;
  signIn.hidden = false;
}

signIn.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = signIn.querySelector('button');
  if (button.disabled) return;
  const form = new FormData(signIn);
  signIn.elements.password.value = '';
  button.disabled = true;
  status.textContent = '正在验证 / Signing in…';
  try {
    const client = await reviewAuth();
    const login = await client.signInWithPassword({
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
    });
    if (login.error) throw login.error;
    const { data, error } = await client.getUser();
    await client.signOut({ scope: 'local' });
    if (error || data?.user?.app_metadata?.grace_play_review !== true) {
      status.textContent = '请使用专用审核账号 / Use the review demo account.';
      return;
    }
    status.textContent = '';
    showSample();
  } catch {
    status.textContent = '登录失败，请检查账号或网络 / Check the credentials or network.';
  } finally {
    button.disabled = false;
  }
});

question.addEventListener('submit', (event) => {
  event.preventDefault();
  if (workspace.hidden) return;
  const value = question.elements.question.value.trim();
  if (!value && !attached) return;
  const answer = sampleAnswer(value, { attached, previousTopic: conversation.at(-1)?.answer?.topic });
  if (!conversation.length) spaces[space].push(conversation);
  conversation.push({ question: value || '示例图问答 / Sample image question', answer });
  question.reset();
  setAttachment(false);
  renderChat();
});

get('example').addEventListener('click', () => {
  question.elements.question.value = sampleQuestion;
  question.requestSubmit();
});
get('use-sample').addEventListener('click', () => setAttachment(true));
get('remove-sample').addEventListener('click', () => setAttachment(false));
get('pick-image').addEventListener('change', pickSampleImage);
get('mic').addEventListener('click', toggleMicrophone);
get('new-chat').addEventListener('click', startChat);
get('file-filter').addEventListener('input', renderFiles);
get('prev-page').addEventListener('click', () => { page -= 1; renderFilePage(); });
get('next-page').addEventListener('click', () => { page += 1; renderFilePage(); });
get('space').addEventListener('change', event => selectSpace(event.target.value));
get('light').addEventListener('change', event => document.body.classList.toggle('review-light', event.target.checked));
get('sign-out').addEventListener('click', resetWorkspace);
for (const button of navigation) button.addEventListener('click', () => selectView(button.dataset.reviewView));
window.addEventListener('pagehide', event => {
  get('voice').pause();
  stopMicrophone();
  if (event.isTrusted) resetWorkspace();
});
