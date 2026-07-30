import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../examples/demo/app.module';
import {
  DEMO_CONTROL_TOKEN,
  createDemoConfig,
  type DemoConfigOverrides,
} from '../examples/demo/demo.config';
import {
  ChaosService,
  ControlService,
  DriverService,
  RequestTailService,
  bootstrapSimService,
  type SimCoreConfig,
} from '../src';

export interface TestHarness {
  app: INestApplication;
  config: SimCoreConfig;
  control: ControlService;
  chaos: ChaosService;
  driver: DriverService;
  tail: RequestTailService;
  token: string;
  close(): Promise<void>;
}

export async function createHarness(
  overrides: DemoConfigOverrides = {},
): Promise<TestHarness> {
  const config = createDemoConfig(overrides);
  const app = await bootstrapSimService(AppModule.forConfig(config), config, {
    listen: false,
    logger: false,
  });

  return {
    app,
    config,
    control: app.get(ControlService),
    chaos: app.get(ChaosService),
    driver: app.get(DriverService),
    tail: app.get(RequestTailService),
    token: config.controlToken ?? DEMO_CONTROL_TOKEN,
    close: async () => {
      await app.close();
    },
  };
}

export const bearer = (token: string): string => `Bearer ${token}`;

/** Wait `ms` of real time (used where fake timers would fight with sockets). */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
