import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { linkPreviews } from '../db/schema';
import { parseOpenGraph } from './link-preview.lib';
import { assertPublicHttpUrl, SsrfBlockedError } from './ssrf-guard';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 1024 * 1024; // 1 MB (§29A.1 rule 2)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type LinkPreviewResult = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  status: 'ok' | 'error';
};

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /** Cache-first bookmark metadata fetch (§29A.1). Never throws — a failed fetch is a cached error result. */
  async getPreview(url: string): Promise<LinkPreviewResult> {
    const [cached] = await this.db.select().from(linkPreviews).where(eq(linkPreviews.url, url));
    if (cached && cached.expiresAt.getTime() > Date.now()) {
      return toResult(cached);
    }

    const fetched = await this.fetchAndParse(url);
    await this.db
      .insert(linkPreviews)
      .values({
        url,
        title: fetched.title,
        description: fetched.description,
        imageUrl: fetched.imageUrl,
        faviconUrl: fetched.faviconUrl,
        status: fetched.status,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      })
      .onConflictDoUpdate({
        target: linkPreviews.url,
        set: {
          title: fetched.title,
          description: fetched.description,
          imageUrl: fetched.imageUrl,
          faviconUrl: fetched.faviconUrl,
          status: fetched.status,
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        },
      });

    return fetched;
  }

  private async fetchAndParse(url: string): Promise<LinkPreviewResult> {
    try {
      await assertPublicHttpUrl(url);

      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok || !response.body) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const html = await readUpTo(response.body, MAX_BYTES);
      const og = parseOpenGraph(html, url);
      return { url, ...og, status: 'ok' };
    } catch (error) {
      if (!(error instanceof SsrfBlockedError)) {
        this.logger.warn(`Link preview fetch failed for ${url}: ${(error as Error).message}`);
      }
      return { url, title: null, description: null, imageUrl: null, faviconUrl: null, status: 'error' };
    }
  }
}

async function readUpTo(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)), received).toString('utf-8');
}

function toResult(cached: typeof linkPreviews.$inferSelect): LinkPreviewResult {
  return {
    url: cached.url,
    title: cached.title,
    description: cached.description,
    imageUrl: cached.imageUrl,
    faviconUrl: cached.faviconUrl,
    status: cached.status as 'ok' | 'error',
  };
}
