const shards = new Map();
async function shardFor(word) {
  const name = /^[a-z]/.test(word) ? word[0] : '_';
  if (!shards.has(name)) {
    const request = fetch(chrome.runtime.getURL('dictionary/' + name + '.json')).then(response => {
      if (!response.ok) throw new Error('離線字典讀取失敗，請重新載入套件。');
      return response.json();
    }).catch(error => { shards.delete(name); throw error; });
    shards.set(name, request);
    if (shards.size > 8) shards.delete(shards.keys().next().value);
  }
  return shards.get(name);
}
export async function lookupDictionary(text) {
  let word = text.toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ').trim();
  if (word.length > 120) return null;
  const visited = new Set();
  for (let i = 0; i < 3 && !visited.has(word); i++) {
    visited.add(word);
    const data = await shardFor(word), entry = Object.hasOwn(data, word) ? data[word] : null;
    if (!entry) return null;
    if (entry[0]) return { translation: entry[0], provider: 'ECDICT', headword: word, phonetic: entry[1] || '' };
    if (!entry[2]) return null;
    word = entry[2].toLowerCase();
  }
  return null;
}
