import 'reflect-metadata';

import { Logger } from '@nestjs/common';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

// Services constructed outside a Nest app (SimStorage, DocsService in unit
// tests) log through the global Nest logger, which would otherwise interleave
// with Jest's reporter. App-level suites already pass `logger: false`.
Logger.overrideLogger(false);
