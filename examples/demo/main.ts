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

/**
 * The env wiring every consumer copies verbatim.
 *
 * `ADMIN_AUTH_ENABLED` is opt-in and stays off locally: leave it unset and this
 * is the ungated v0.2.0 service. Turned on, it needs a Google OAuth client
 * whose authorized redirect URI includes
 * `http://localhost:${PORT}/admin/auth/callback` — see "Creating the Google
 * OAuth client" in the README.
 */
if (process.env.ADMIN_AUTH_ENABLED === 'true' || process.env.ADMIN_AUTH_ENABLED === '1') {
  config.adminAuth = {
    enabled: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    allowedDomain: process.env.ADMIN_ALLOWED_DOMAIN ?? 'partnerapi.com',
    sessionSecret: process.env.ADMIN_SESSION_SECRET ?? '',
    // Optional, comma-separated. Absent means "anyone in the domain".
    ...(process.env.ADMIN_ALLOWED_EMAILS
      ? { allowedEmails: process.env.ADMIN_ALLOWED_EMAILS.split(',').map((e) => e.trim()) }
      : {}),
    ...(process.env.ADMIN_SESSION_TTL_HOURS
      ? { sessionTtlHours: Number(process.env.ADMIN_SESSION_TTL_HOURS) }
      : {}),
  };
}

void bootstrapSimService(AppModule.forConfig(config), config, { rawBody: true });
