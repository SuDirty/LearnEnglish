import { randomUUID } from 'node:crypto';

export class TranslationJobs {
  constructor(backend, { concurrency = 2, capacity = 8, ttl = 600_000, onEvent = () => {}, progressMs = 5000 } = {}) {
    Object.assign(this, { backend, concurrency, capacity, ttl, onEvent, progressMs });
    this.jobs = new Map();
    this.active = 0;
    this.stopped = false;
  }
  emit(type, job) {
    try {
      this.onEvent({ type, jobId: job.id, text: job.text, translation: job.result?.translation,
        error: job.error, characters: [...job.text].length,
        elapsedMs: Date.now() - (job.startedAt ?? job.createdAt),
        waitMs: (job.startedAt ?? Date.now()) - job.createdAt,
        active: this.active, queued: [...this.jobs.values()].filter(item => item.status === 'queued').length });
    } catch {} // Terminal diagnostics must never interrupt translation jobs.
  }
  prune() {
    for (const [id, job] of this.jobs) {
      if (job.finishedAt && Date.now() - job.finishedAt > this.ttl) this.jobs.delete(id);
    }
  }
  start(text, requestId, task = 'translation') {
    this.prune();
    if (this.stopped) throw new Error('翻譯服務正在關閉。');
    const prior = [...this.jobs.values()].find(job => job.requestId === requestId);
    if (prior) {
      if (prior.text !== text || prior.task !== task) throw new Error('重複請求的文字不一致。');
      this.emit('job.reused', prior);
      return { jobId: prior.id, status: prior.status };
    }
    if ([...this.jobs.values()].filter(job => !job.finishedAt).length >= this.capacity) {
      throw new Error('翻譯佇列已滿，請稍後再試。');
    }
    if (this.jobs.size >= 300) {
      const oldest = [...this.jobs.values()].find(job => job.finishedAt);
      if (oldest) this.jobs.delete(oldest.id);
    }
    const job = { id: randomUUID(), requestId, text, task, status: 'queued', createdAt: Date.now() };
    this.jobs.set(job.id, job);
    this.emit('job.queued', job);
    this.pump();
    return { jobId: job.id, status: job.status };
  }
  get(id) {
    this.prune();
    const job = this.jobs.get(id);
    if (!job) throw new Error('翻譯工作不存在或已過期，請重新翻譯。');
    return { jobId: id, status: job.status, ...(job.result ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}) };
  }
  pump() {
    if (this.stopped) return;
    for (const job of this.jobs.values()) {
      if (this.active >= this.concurrency) break;
      if (job.status !== 'queued') continue;
      job.status = 'running';
      job.startedAt = Date.now();
      this.active++;
      this.emit('job.started', job);
      job.progressTimer = setInterval(() => this.emit('job.progress', job), this.progressMs);
      job.progressTimer.unref?.();
      Promise.resolve().then(() => {
        if (job.task === 'vocabulary') return this.backend.analyzeVocabulary(JSON.parse(job.text));
        if (job.task === 'word') { const { text, context } = JSON.parse(job.text); return this.backend.translateWord(text, context); }
        return this.backend.translate(job.text);
      }).then(result => {
        job.result = job.task !== 'translation' ? result : { translation: result.translation, provider: result.provider || 'Codex (MCP)', ...(result.cacheIdentity ? { cacheIdentity: result.cacheIdentity } : {}) };
        job.status = 'completed';
      }, error => {
        job.error = error.message || 'AI 翻譯失敗。';
        job.status = 'failed';
      }).finally(() => {
        clearInterval(job.progressTimer);
        job.finishedAt = Date.now();
        this.active--;
        this.emit(job.status === 'completed' ? 'job.completed' : 'job.failed', job);
        this.pump();
      });
    }
  }
  close() {
    this.stopped = true;
    this.backend.close?.();
    for (const job of this.jobs.values()) {
      clearInterval(job.progressTimer);
      if (job.status === 'queued') {
        Object.assign(job, { status: 'failed', error: '服務已關閉。', finishedAt: Date.now() });
        this.emit('job.failed', job);
      }
    }
  }
}
