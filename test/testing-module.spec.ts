import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../examples/demo/app.module';
import { createDemoConfig } from '../examples/demo/demo.config';
import { ChaosService, ControlService, DriverService } from '../src';
import { bearer } from './helpers';

/**
 * Consumers will unit-test their own modules with `@nestjs/testing`, so prove
 * the module composes there too.
 *
 * Caveat worth knowing (documented in the README): `ServeStaticModule`
 * instantiates its loader while providers are created, which happens during
 * `.compile()` — before `createNestApplication()` has an HTTP adapter. So
 * `/admin` is not served from a TestingModule; pass `admin: false` and use
 * `bootstrapSimService(..., { listen: false })` when you need it.
 */
describe('SimCoreModule under @nestjs/testing', () => {
  it('compiles, exposes its services and serves /__control', async () => {
    const config = createDemoConfig({ admin: false });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forConfig(config)],
    }).compile();

    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    try {
      expect(moduleRef.get(ChaosService)).toBeInstanceOf(ChaosService);
      expect(moduleRef.get(DriverService)).toBeInstanceOf(DriverService);
      expect(moduleRef.get(ControlService)).toBeInstanceOf(ControlService);

      await request(app.getHttpServer()).get('/__control/state').expect(401);
      const res = await request(app.getHttpServer())
        .get('/__control/state')
        .set('authorization', bearer(config.controlToken))
        .expect(200);
      expect(res.body.baseline.overall).toBe(true);

      await request(app.getHttpServer()).get('/health').expect(200);
      await request(app.getHttpServer()).get('/widgets').expect(200);
    } finally {
      await app.close();
    }
  });

  it('supports overriding a sim-core provider', async () => {
    const config = createDemoConfig({ admin: false });
    const stubChaos = new ChaosService('override-seed');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forConfig(config)],
    })
      .overrideProvider(ChaosService)
      .useValue(stubChaos)
      .compile();

    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    try {
      stubChaos.apply({ reject: { status: 418 } });
      await request(app.getHttpServer()).get('/widgets').expect(418);
    } finally {
      await app.close();
    }
  });
});
