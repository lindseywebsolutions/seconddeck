import { config, assertProductionConfig } from './config.js';
import { createAuthService } from './auth.js';
import { createMailer } from './mailer.js';
import { createDeckStore } from './store.js';
import { createAiService } from './providers.js';
import { createApp } from './app.js';
import { loadDeckCatalog } from './catalog.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

assertProductionConfig(config);
const mailer = createMailer(config.smtp);
const authService = createAuthService({ secret: config.sessionSecret, sendCode: mailer.sendCode });
const aiService = createAiService(config);
const catalogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../catalog');
const catalog = await loadDeckCatalog(catalogPath, {
  ref: `v${process.env.APP_VERSION || '0.13.0'}`,
  assetBaseUrl: `${config.publicUrl}/catalog-assets`
});
const app = createApp({ config, authService, aiService, deckStore: createDeckStore(config.dataPath, { catalog }), mailer });

app.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'SecondDeck listening', port: config.port, catalogDecks: catalog.length }));
});
