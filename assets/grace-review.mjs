import { loadBrowserScript } from './browser-dependency.mjs';
import { publicConfig } from './grace-public-config.mjs';
import { fitGraceViewport } from './grace-viewport.mjs';

const signIn = document.querySelector('#review-sign-in');
const workspace = document.querySelector('#review-workspace');
const status = document.querySelector('#review-status');
const question = document.querySelector('#review-question');
const answer = document.querySelector('#review-answer');
const preview = document.querySelector('#review-preview');
const download = document.querySelector('#review-download');
const sampleTitle = 'Grace 示例画册，第 1 页 / Grace Sample Catalogue, p. 1';
const sampleFact = '示例门的标准尺寸为 900 × 2100 毫米。 The sample door measures 900 × 2100 mm.';
let auth;
let sampleUrl;

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

function showSample() {
  preview.textContent = sampleFact;
  sampleUrl = URL.createObjectURL(new Blob([`${sampleTitle}\n${sampleFact}\n`], { type: 'text/plain;charset=utf-8' }));
  download.href = sampleUrl;
  signIn.hidden = true;
  workspace.hidden = false;
}

function resetWorkspace() {
  if (sampleUrl) URL.revokeObjectURL(sampleUrl);
  sampleUrl = undefined;
  download.removeAttribute('href');
  document.querySelector('#review-source').parentElement.open = false;
  preview.textContent = '';
  answer.textContent = '';
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
  if (!value) return;
  answer.textContent = /尺寸|规格|宽|高|size|dimension|height|width/i.test(value)
    ? `${sampleFact} 来源 / Source: ${sampleTitle}`
    : '可以试问示例门的尺寸。 Try asking for the sample door dimensions.';
});

document.querySelector('#review-example').addEventListener('click', () => {
  question.elements.question.value = '示例门的标准尺寸是多少？';
  question.requestSubmit();
});
document.querySelector('#review-sign-out').addEventListener('click', resetWorkspace);
window.addEventListener('pagehide', resetWorkspace);
