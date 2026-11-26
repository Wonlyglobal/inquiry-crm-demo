import { sampleFiles, sampleFileText } from './grace-review-samples.mjs';

const file = sampleFiles.find(entry => entry.id === location.hash.slice(1));
const link = document.querySelector('#review-download-link');
const title = document.querySelector('#review-download-title');
if (file) {
  const url = URL.createObjectURL(new Blob([sampleFileText(file)], { type: 'text/plain;charset=utf-8' }));
  title.textContent = file.title;
  link.href = url;
  link.download = file.filename;
  link.hidden = false;
  window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
} else if (location.hash === '#image') {
  title.textContent = 'Grace sample door drawing';
  link.href = 'assets/grace-review-sample-door.svg';
  link.download = 'grace-review-sample-door.svg';
  link.hidden = false;
}
