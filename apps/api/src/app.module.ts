import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AttachmentsModule } from './attachments/attachments.module';
import { BlocksModule } from './blocks/blocks.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { WhiteboardModule } from './content-types/whiteboard/whiteboard.module';
import { DatabasesModule } from './databases/databases.module';
import { DrizzleModule } from './db/drizzle.module';
import { ExportModule } from './export/export.module';
import { HealthModule } from './health/health.module';
import { LinkPreviewModule } from './link-preview/link-preview.module';
import { PageLinksModule } from './page-links/page-links.module';
import { PagesModule } from './pages/pages.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { TemplatesModule } from './templates/templates.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DrizzleModule,
    HealthModule,
    WorkspacesModule,
    PagesModule,
    PageLinksModule,
    BlocksModule,
    DatabasesModule,
    StorageModule,
    AttachmentsModule,
    SearchModule,
    ExportModule,
    WhiteboardModule,
    LinkPreviewModule,
    TemplatesModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
