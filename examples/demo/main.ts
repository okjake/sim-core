import 'reflect-metadata';

import { bootstrapSimService } from '../../src';
import { AppModule } from './app.module';
import { createDemoConfig } from './demo.config';

/**
 * `pnpm example` — runs the demo service on :3000 so you can poke /admin,
 * /health, /openapi.json and the /__control plane by hand.
 */
const config = createDemoConfig({
  controlToken: process.env.CONTROL_TOKEN,
  driver: { autoStart: false },
});
config.port = Number(process.env.PORT ?? 3000);

void bootstrapSimService(AppModule.forConfig(config), config);
