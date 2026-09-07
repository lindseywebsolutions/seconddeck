import { config, assertProductionConfig } from './config.js';
import { createAuthService } from './auth.js';
import { createMailer } from './mailer.js';
import { createDeckStore } from './store.js';
import { createAiService } from './providers.js';
import { createApp } from './app.js';

assertProductionConfig(config);
const mailer = createMailer(config.smtp);
const authService = createAuthService({ secret: config.sessionSecret, sendCode: mailer.sendCode });
const aiService = createAiService(config);
const app = createApp({ config, authService, aiService, deckStore: createDeckStore(config.dataPath), mailer });

app.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'SecondDeck listening', port: config.port }));
});
