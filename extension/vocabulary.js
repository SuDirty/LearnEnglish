export const RUBRIC_VERSION = 1;
export const VOCABULARY_TAGS = ['日常', '商用', '旅遊', '學術', '科技', '情感', '俚語', '正式', '非正式', '文學', '專業術語'];
export const ANALYSIS_BATCH_SIZE = 10;
export const scoreInput = entry => ({ id: entry.id, text: entry.text.slice(0, 200),
  translation: (entry.translation || '').slice(0, 300), context: (entry.context || '').slice(0, 500) });
export const scoreFingerprint = entry => JSON.stringify(scoreInput(entry));
export const priorityLabel = score => score >= 80 ? '優先學習' : score >= 60 ? '值得學習' : score >= 40 ? '情境需要時學' : '有餘力再學';

export function validateScores(value, entries) {
  if (!value || !Array.isArray(value.scores) || value.scores.length !== entries.length) throw new Error('AI 評分不完整，請重試。');
  const expected = new Set(entries.map(entry => entry.id));
  if (expected.size !== entries.length) throw new Error('評分單字識別碼重複。');
  return value.scores.map(item => {
    if (!item || !expected.delete(item.id) || !['frequency', 'usefulness'].every(key => Number.isInteger(item[key]) && item[key] >= 0 && item[key] <= 100)
      || !Array.isArray(item.tags) || item.tags.length < 1 || item.tags.length > 4 || new Set(item.tags).size !== item.tags.length
      || item.tags.some(tag => !VOCABULARY_TAGS.includes(tag))
      || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 300) throw new Error('AI 評分格式錯誤，請重試。');
    return { id: item.id, frequency: item.frequency, usefulness: item.usefulness,
      score: Math.round((item.frequency + item.usefulness) / 2), reason: item.reason.trim(), tags: [...item.tags] };
  });
}
export function currentScore(entry) {
  const value = entry.learningScore;
  if (entry.kind !== 'word' || value?.version !== RUBRIC_VERSION || value.fingerprint !== scoreFingerprint(entry)) return null;
  try { return { ...value, ...validateScores({ scores: [{ ...value, id: entry.id }] }, [entry])[0] }; }
  catch { return null; }
}

// Merge into the latest storage snapshot so edits and deletes during inference are preserved.
export function mergeScores(current, inputs, result, analyzedAt = new Date().toISOString()) {
  const scores = new Map(validateScores(result, inputs).map(item => [item.id, item]));
  const originals = new Map(inputs.map(entry => [entry.id, scoreFingerprint(entry)]));
  let updated = 0;
  const entries = current.map(entry => {
    if (entry.kind !== 'word' || !scores.has(entry.id) || originals.get(entry.id) !== scoreFingerprint(entry)) return entry;
    updated++;
    const { id, ...score } = scores.get(entry.id);
    return { ...entry, learningScore: { ...score, version: RUBRIC_VERSION, fingerprint: originals.get(entry.id),
      provider: result.provider, model: result.model || '', analyzedAt } };
  });
  return { entries, updated };
}

const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export const inlineContext = value => compact(value).slice(0, 500);
const inlineFingerprint = (text, translation, context) => JSON.stringify([compact(text), compact(translation), inlineContext(context)]);
export function prepareInlineScore(result, text, context) {
  const { id, ...rating } = validateScores({ scores: [{ ...result.learningScore, id: 'word' }] }, [{ id: 'word' }])[0];
  return { ...rating, version: RUBRIC_VERSION, sourceFingerprint: inlineFingerprint(text, result.translation, context),
    provider: result.provider, model: result.model || '', analyzedAt: new Date().toISOString() };
}
export function bindInlineScore(entry, value) {
  if (entry.kind !== 'word' || !['Codex (MCP)', 'Antigravity (MCP)', 'GitHub Copilot (MCP)'].includes(entry.translationSource)
    || value?.version !== RUBRIC_VERSION || value.provider !== entry.translationSource
    || value.sourceFingerprint !== inlineFingerprint(entry.text, entry.translation, entry.context)) return null;
  try {
    const { id, ...rating } = validateScores({ scores: [{ ...value, id: entry.id }] }, [entry])[0];
    if (!Number.isFinite(Date.parse(value.analyzedAt))) return null;
    return { ...rating, version: RUBRIC_VERSION, fingerprint: scoreFingerprint(entry), provider: value.provider,
      model: String(value.model || '').slice(0, 100), analyzedAt: value.analyzedAt };
  } catch { return null; }
}
