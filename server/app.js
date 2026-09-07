import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { requireUser } from './auth.js';
import { validateDeck, widgetTypes } from './deckSchema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ config, authService, aiService, deckStore, mailer }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: [config.publicUrl, 'https://localhost', 'capacitor://localhost'], methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '128kb' }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
  const aiLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

  app.get('/api/health/live', (_req, res) => res.json({ status: 'ok', service: 'seconddeck' }));
  app.get('/api/health/ready', async (_req, res) => {
    try { await mailer.verify(); res.json({ status: 'ready', email: 'ready' }); }
    catch { res.status(503).json({ status: 'not-ready', email: 'unavailable' }); }
  });
  app.get('/api/config', (_req, res) => res.json({
    name: 'SecondDeck', version: process.env.APP_VERSION || '0.4.0', login: 'email-code', widgetTypes,
    deckSchemaVersion: 1, deckFileFormats: ['json', 'yaml'], maxDeckFileBytes: 65_536,
    downloadUrl: `${config.publicUrl}/downloads/seconddeck-v${process.env.APP_VERSION || '0.4.0'}.apk`,
    obtainiumSourceUrl: config.publicUrl
  }));

  app.post('/api/auth/request-code', authLimiter, async (req, res, next) => {
    try { await authService.requestCode(req.body?.email); res.status(202).json({ accepted: true }); }
    catch (error) { next(error); }
  });
  app.post('/api/auth/verify-code', authLimiter, async (req, res, next) => {
    try {
      const token = await authService.verifyCode(req.body?.email, req.body?.code);
      if (!token) return res.status(401).json({ error: 'That code is invalid or expired.' });
      res.json({ token });
    } catch (error) { next(error); }
  });

  const authenticated = requireUser(authService);
  app.get('/api/me', authenticated, (req, res) => res.json({ email: req.user.email, aiProvider: aiService.providerForEmail?.(req.user.email) }));
  app.get('/api/decks', authenticated, async (req, res, next) => {
    try { res.json({ decks: await deckStore.list(req.user, { includeReview: aiService.providerForEmail?.(req.user.email) === 'codex' }) }); }
    catch (error) { next(error); }
  });
  app.post('/api/decks', authenticated, async (req, res, next) => {
    try {
      const result = validateDeck(req.body);
      if (!result.success) return res.status(400).json({ error: 'Invalid Deck manifest.', issues: result.error.issues.map(({ path, message }) => ({ path, message })) });
      res.status(201).json({ deck: await deckStore.submit(result.data, req.user) });
    } catch (error) { next(error); }
  });
  app.post('/api/decks/:id/review', authenticated, async (req, res, next) => {
    try {
      if (aiService.providerForEmail?.(req.user.email) !== 'codex') return res.status(403).json({ error: 'A verified Lindsey Web Solutions account is required.' });
      const status = String(req.body?.status || '');
      if (!['published', 'rejected'].includes(status)) return res.status(400).json({ error: 'Review status must be published or rejected.' });
      const deck = await deckStore.review(req.params.id, status, req.user);
      if (!deck) return res.status(404).json({ error: 'Deck not found.' });
      res.json({ deck });
    } catch (error) { next(error); }
  });
  app.post('/api/assistant', authenticated, aiLimiter, async (req, res, next) => {
    try {
      const prompt = String(req.body?.prompt || '').trim();
      if (prompt.length < 3 || prompt.length > 2000) return res.status(400).json({ error: 'Prompt must be between 3 and 2,000 characters.' });
      res.json(await aiService.ask(req.user.email, prompt));
    } catch (error) { next(error); }
  });

  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.type('application/json').sendFile(path.join(root, 'public/.well-known/assetlinks.json'), { dotfiles: 'allow' });
  });
  app.use('/downloads', express.static(path.join(root, 'public/downloads'), { immutable: false, maxAge: '5m' }));
  app.use(express.static(path.join(root, 'dist'), { maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  app.use((error, _req, res, _next) => {
    if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message });
    console.error(JSON.stringify({ level: 'error', message: error.message }));
    res.status(503).json({ error: 'SecondDeck could not complete that request.' });
  });
  return app;
}
