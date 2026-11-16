import { type DynamicModule, Module } from '@nestjs/common';
import { HealthModule } from '@triage/service-kit';
import { CoreModule, type CoreModuleOptions } from './core.module';
import { type ExternalPorts, TriageModule } from './triage/triage.module';

export interface AppModuleOptions extends CoreModuleOptions {
  ports?: ExternalPorts;
}

@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(options), HealthModule, TriageModule.forRoot(options.ports)],
    };
  }
}
