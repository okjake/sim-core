import 'reflect-metadata';

import { bootstrapSimService } from '../../src';
import { AppModule } from './app.module';
import { createDemoConfig } from './demo.config';

/**
 * `pnpm example` — runs the demo service on :3000 so you can poke /admin,
 * /docs, /health, /openapi.json and the /__control plane by hand.
 *
 * Docs are on here (they are off by default for consumers) so the admin SPA's
 * Docs tab has something to edit. `DOCS=0 pnpm example` turns them off to see
 * the v0.1.0-shaped service instead.
 */
const docsEnabled = process.env.DOCS !== '0';

const config = createDemoConfig({
  controlToken: process.env.CONTROL_TOKEN,
  driver: { autoStart: false },
  // A real file rather than :memory:, so edits survive a restart the way they
  // will on a Render disk.
  ...(docsEnabled ? { docs: { databaseFile: 'demo-docs.sqlite' } } : {}),
});
config.port = Number(process.env.PORT ?? 3000);

void bootstrapSimService(AppModule.forConfig(config), config, { rawBody: true });
