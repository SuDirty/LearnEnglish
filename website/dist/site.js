const entries = {
  make: { pronunciation: '/meɪk/', definition: '製作；使成為；促成' },
  happen: { pronunciation: '/ˈhæpən/', definition: '發生；出現' },
};
let selected = 'make';
const saved = new Set();
const saveButton = document.querySelector('#save-demo');
function refreshSave() {
  const isSaved = saved.has(selected);
  saveButton.setAttribute('aria-pressed', String(isSaved));
  saveButton.textContent = isSaved ? '✓ 已收進口袋 · 再點取消' : '＋ 收藏這個單字';
}
document.querySelectorAll('[data-word]').forEach(button => {
  button.addEventListener('click', () => {
    selected = button.dataset.word;
    const entry = entries[selected];
    document.querySelectorAll('[data-word]').forEach(word => word.setAttribute('aria-pressed', String(word === button)));
    const pronunciation = document.createElement('span');
    pronunciation.textContent = entry.pronunciation;
    document.querySelector('#demo-word').replaceChildren(`${selected} `, pronunciation);
    const partOfSpeech = document.createElement('span');
    partOfSpeech.textContent = 'v.';
    document.querySelector('#demo-definition').replaceChildren(partOfSpeech, ` ${entry.definition}`);
    document.querySelector('#demo-status').textContent = `${selected}：${entry.definition}`;
    refreshSave();
  });
});
saveButton.addEventListener('click', () => {
  if (saved.has(selected)) saved.delete(selected); else saved.add(selected);
  refreshSave();
  document.querySelector('#demo-status').textContent = saved.has(selected) ? `已在示意中收藏 ${selected}` : `已在示意中取消收藏 ${selected}`;
});
const copyButton = document.querySelector('#copy-address');
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('chrome://extensions');
    document.querySelector('#copy-status').textContent = '已複製，請貼到 Chrome 網址列。';
    copyButton.textContent = '已複製 ✓';
  } catch {
    document.querySelector('#copy-status').textContent = '無法自動複製，請手動選取上方網址並貼到 Chrome 網址列。';
  }
});
