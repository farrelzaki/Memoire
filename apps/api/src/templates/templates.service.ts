import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { Template, templates } from '../db/schema';

/** Row templates (§20D) — pre-filled `values` a new row can be seeded from. */
@Injectable()
export class TemplatesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  async listForDatabase(databaseId: string): Promise<Template[]> {
    return this.db.select().from(templates).where(eq(templates.databaseId, databaseId));
  }

  async create(data: {
    id?: string;
    databaseId: string;
    name: string;
    icon?: string | null;
    content: Record<string, unknown>;
  }): Promise<Template> {
    const [template] = await this.db
      .insert(templates)
      .values({
        ...(data.id ? { id: data.id } : {}),
        databaseId: data.databaseId,
        name: data.name,
        icon: data.icon ?? null,
        content: data.content,
      })
      .returning();
    return template;
  }

  async delete(id: string): Promise<{ id: string; deleted: boolean }> {
    const [existing] = await this.db.select().from(templates).where(eq(templates.id, id));
    if (!existing) throw new NotFoundException(`Template ${id} not found`);
    await this.db.delete(templates).where(eq(templates.id, id));
    return { id, deleted: true };
  }
}
