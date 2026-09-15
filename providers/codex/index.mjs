import { CodexClient, translate } from './codex.mjs';

export function createBackend() {
  const clients = new Set();
  async function withClient(fn) {
    const client = new CodexClient();
    clients.add(client);
    try {
      await client.initialize();
      const { account, requiresOpenaiAuth } = await client.request('account/read', { refreshToken: false });
      if (!account && requiresOpenaiAuth) throw new Error('Codex 尚未登入，請在終端機執行 codex login。');
      return await fn(client, account);
    } finally { client.close(); clients.delete(client); }
  }
  return {
    status: () => withClient((client, account) => ({ connected: true, authType: account?.type ?? null })),
    translate: text => withClient(client => translate(client, text, { model: process.env.CODEX_MODEL })),
    close: () => { for (const client of clients) client.close(); },
  };
}
