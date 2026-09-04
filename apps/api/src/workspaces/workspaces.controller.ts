import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { workspaceSettingsSchema } from '@memoire/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WorkspacesService } from './workspaces.service';

const updateWorkspaceSchema = z.object({ settings: workspaceSettingsSchema });

@Controller('workspace')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  get() {
    return this.workspacesService.getOrCreateDefault();
  }

  @Patch()
  update(@Body(new ZodValidationPipe(updateWorkspaceSchema)) body: { settings: Record<string, unknown> }) {
    return this.workspacesService.updateSettings(body.settings);
  }
}
