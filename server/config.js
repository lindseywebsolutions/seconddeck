export const config = {
  port: Number(process.env.PORT || 4080),
  publicUrl: process.env.PUBLIC_URL || 'https://seconddeck.lws-workspace.com',
  dataPath: process.env.DATA_PATH || './data',
  sessionSecret: process.env.SESSION_SECRET || '',
  corporateDomain: (process.env.CORPORATE_EMAIL_DOMAIN || 'lindseywebsolutions.com').toLowerCase(),
  ollamaUrl: process.env.OLLAMA_URL || 'http://ollama.lindseywebsolutions.svc.cluster.local:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct',
  codexModel: process.env.CODEX_MODEL || 'gpt-5.3-codex',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || ''
  }
};

export function assertProductionConfig(value = config) {
  const missing = [];
  if (!value.sessionSecret || value.sessionSecret.length < 32) missing.push('SESSION_SECRET');
  if (!value.smtp.host) missing.push('SMTP_HOST');
  if (!value.smtp.user) missing.push('SMTP_USER');
  if (!value.smtp.pass) missing.push('SMTP_PASS');
  if (!value.smtp.from) missing.push('EMAIL_FROM');
  if (missing.length) throw new Error(`Missing required runtime configuration: ${missing.join(', ')}`);
}
