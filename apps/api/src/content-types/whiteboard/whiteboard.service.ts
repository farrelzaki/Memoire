import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../db/drizzle.provider';
import { PageCanvas, pageCanvases } from '../../db/schema';
import { PagesService } from '../../pages/pages.service';

@Injectable()
export class WhiteboardService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly pagesService: PagesService,
  ) {}

  /** Return the page's canvas, creating an empty one on first access (§11A getContent). */
  async getOrCreate(pageId: string): Promise<PageCanvas> {
    const page = await this.pagesService.findOne(pageId);
    if (page.type !== 'whiteboard' && page.type !== 'diagram') {
      throw new BadRequestException(`Page ${pageId} is not a canvas page`);
    }

    const [canvas] = await this.db
      .select()
      .from(pageCanvases)
      .where(eq(pageCanvases.pageId, pageId));
    if (canvas) return canvas;

    const [created] = await this.db
      .insert(pageCanvases)
      .values({ pageId, canvasKind: page.type, elements: [], viewport: {} })
      .returning();
    return created;
  }

  async update(
    pageId: string,
    data: { elements?: unknown[]; viewport?: Record<string, unknown> },
  ): Promise<PageCanvas> {
    const canvas = await this.getOrCreate(pageId);
    const [updated] = await this.db
      .update(pageCanvases)
      .set({
        elements: data.elements ?? canvas.elements,
        viewport: data.viewport ?? canvas.viewport,
        updatedAt: sql`now()`,
      })
      .where(eq(pageCanvases.id, canvas.id))
      .returning();
    return updated;
  }
}
