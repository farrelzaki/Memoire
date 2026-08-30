import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { BlocksModule } from './blocks/blocks.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DrizzleModule } from './db/drizzle.module';
import { HealthModule } from './health/health.module';
import { PagesModule } from './pages/pages.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    HealthModule,
    WorkspacesModule,
    PagesModule,
    BlocksModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
