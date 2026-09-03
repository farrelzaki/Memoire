import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { Attachment, attachments } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { extractExtension, sanitizeFilename } from './filename.util';

const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB — video is the largest upload kind (§12B.2)

// §28 — images, documents, and video/audio/pdf for the media blocks (§12B.2).
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
]);

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly storage: StorageService,
  ) {}

  async upload(file: UploadedFile, pageId: string): Promise<Attachment> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 200 MB limit');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const extension = extractExtension(file.originalname);
    const key = `attachments/${randomUUID()}${extension ? `.${extension}` : ''}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const [attachment] = await this.db
      .insert(attachments)
      .values({
        pageId,
        filename: sanitizeFilename(file.originalname),
        mimeType: file.mimetype,
        size: file.size,
        storageKey: key,
      })
      .returning();
    return attachment;
  }

  async findOne(id: string): Promise<Attachment> {
    const [attachment] = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id));
    if (!attachment) throw new NotFoundException(`Attachment ${id} not found`);
    return attachment;
  }

  async getContent(id: string): Promise<{ stream: Readable; contentType: string }> {
    const attachment = await this.findOne(id);
    const { stream, contentType } = await this.storage.get(attachment.storageKey);
    return { stream, contentType };
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const attachment = await this.findOne(id);
    await this.storage.delete(attachment.storageKey);
    await this.db.delete(attachments).where(eq(attachments.id, id));
    return { id, deleted: true };
  }
}
