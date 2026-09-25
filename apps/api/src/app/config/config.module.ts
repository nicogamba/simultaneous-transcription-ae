import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig, loadAppConfig } from '../config/app.config';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => loadAppConfig(process.env),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {
  static appConfig(): AppConfig {
    return loadAppConfig(process.env);
  }
}