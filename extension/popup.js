const $ = id => document.getElementById(id);
try {
  const settings = await chrome.storage.local.get({ enabled: true, pauseOnLookup: true, entries: [] });
  for (const key of ['enabled', 'pauseOnLookup']) {
    $(key).checked = settings[key];
    $(key).onchange = async () => {
      try { await chrome.storage.local.set({ [key]: $(key).checked }); }
      catch { $('status').textContent = '設定儲存失敗，請重試。'; }
    };
  }
  $('count').textContent = settings.entries.length;
} catch { $('status').textContent = '讀取失敗，請重新開啟擴充功能。'; }
$('open').onclick = () => chrome.runtime.openOptionsPage();

$('translation-settings').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('translation-settings.html') });
