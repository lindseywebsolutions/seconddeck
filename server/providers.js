import { spawn } from 'node:child_process';

export function providerForEmail(email, corporateDomain) {
  return String(email).toLowerCase().endsWith(`@${String(corporateDomain).toLowerCase()}`) ? 'codex' : 'ollama';
}

function assistantSystemPrompt(prompt) {
  return [
    'You are the SecondDeck companion assistant.',
    'Help with safe declarative Deck layouts, play-session checklists, guides, and device workflows.',
    'Never claim to inspect a running game or private device data. Never generate executable plugins or cheating automation.',
    'Keep the answer concise and useful on a handheld screen.',
    `User request: ${prompt}`
  ].join('\n');
}

export function createAiService({ corporateDomain, ollamaUrl, ollamaModel, codexModel, fetchImpl = fetch, spawnImpl = spawn }) {
  async function runOllama(prompt) {
    const response = await fetchImpl(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, prompt: assistantSystemPrompt(prompt), stream: false }),
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const body = await response.json();
    if (!body.response) throw new Error('Ollama returned an empty response');
    return body.response.trim();
  }

  function runCodex(prompt) {
    return new Promise((resolve, reject) => {
      const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '--model', codexModel, assistantSystemPrompt(prompt)];
      const child = spawnImpl(process.env.CODEX_BIN || 'codex', args, {
        cwd: '/tmp', env: { HOME: process.env.HOME, PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME || '/app/.codex', LANG: 'C.UTF-8' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = ''; let stderr = ''; let settled = false;
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Codex timed out')); }, 120_000);
      child.stdout.on('data', (chunk) => { if (stdout.length < 200_000) stdout += chunk; });
      child.stderr.on('data', (chunk) => { if (stderr.length < 20_000) stderr += chunk; });
      child.on('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
      child.on('close', (code) => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (code !== 0 || !stdout.trim()) reject(new Error(`Codex failed with exit ${code}: ${stderr.slice(-500)}`));
        else resolve(stdout.trim());
      });
    });
  }

  return {
    providerForEmail(email) {
      return providerForEmail(email, corporateDomain);
    },
    async ask(email, prompt) {
      const provider = providerForEmail(email, corporateDomain);
      const answer = provider === 'codex' ? await runCodex(prompt) : await runOllama(prompt);
      return { provider, model: provider === 'codex' ? codexModel : ollamaModel, answer };
    }
  };
}
