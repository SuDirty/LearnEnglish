import { randomUUID } from 'node:crypto';

export class TranslationJobs {
  constructor(backend, { concurrency = 2, capacity = 8, ttl = 600_000 } = {}) {
    Object.assign(this, { backend, concurrency, capacity, ttl });
    this.jobs = new Map();
    this.active = 0;
    this.stopped = false;
  }
  prune() {
    for (const [id, job] of this.jobs) {
      if (job.finishedAt && Date.now() - job.finishedAt > this.ttl) this.jobs.delete(id);
    }
  }
  start(text, requestId) {
    this.prune();
    if (this.stopped) throw new Error('翻譯服務正在關閉。');
    const prior = [...this.jobs.values()].find(job => job.requestId === requestId);
    if (prior) {
      if (prior.text !== text) throw new Error('重複請求的文字不一致。');
      return { jobId: prior.id, status: prior.status };
    }
    if ([...this.jobs.values()].filter(job => !job.finishedAt).length >= this.capacity) {
      throw new Error('翻譯佇列已滿，請稍後再試。');
    }
    if (this.jobs.size >= 300) {
      const oldest = [...this.jobs.values()].find(job => job.finishedAt);
      if (oldest) this.jobs.delete(oldest.id);
    }
    const job = { id: randomUUID(), requestId, text, status: 'queued' };
    this.jobs.set(job.id, job);
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
      this.active++;
      Promise.resolve().then(() => this.backend.translate(job.text)).then(result => {
        job.result = { translation: result.translation, provider: 'Codex (MCP)' };
        job.status = 'completed';
      }, error => {
        job.error = error.message || 'Codex 翻譯失敗。';
        job.status = 'failed';
      }).finally(() => {
        job.finishedAt = Date.now();
        this.active--;
        this.pump();
      });
    }
  }
  close() {
    this.stopped = true;
    this.backend.close?.();
    for (const job of this.jobs.values()) {
      if (job.status === 'queued') Object.assign(job, { status: 'failed', error: '服務已關閉。', finishedAt: Date.now() });
    }
  }
}
