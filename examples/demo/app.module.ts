import { Module, type DynamicModule } from '@nestjs/common';

import { SimCoreModule, type SimCoreConfig } from '../../src';
import { createDemoConfig, type DemoConfigOverrides } from './demo.config';
import { WidgetsController } from './widgets.controller';

/**
 * The minimal shape every sim company repo has: import `SimCoreModule.forRoot`,
 * add your own domain controllers.
 */
@Module({})
export class AppModule {
  static forConfig(config: SimCoreConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [SimCoreModule.forRoot(config)],
      controllers: [WidgetsController],
    };
  }

  static demo(overrides: DemoConfigOverrides = {}): DynamicModule {
    return AppModule.forConfig(createDemoConfig(overrides));
  }
}
