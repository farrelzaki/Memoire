import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

/**
 * Thin wrapper over S3-compatible object storage (MinIO locally, S3/R2/B2 in
 * production — §6). Binary files never touch PostgreSQL (§57 Decision 5).
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketEnsured = false;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'memoire';
    this.client = new S3Client({
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: config.get<string>('S3_ENDPOINT'),
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY') ?? 'memoire',
        secretAccessKey: config.get<string>('S3_SECRET_KEY') ?? 'memoire123',
      },
      // Required for MinIO (path-style addressing).
      forcePathStyle: true,
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<{ stream: Readable; contentType: string }> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: result.Body as unknown as Readable,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Create the bucket on first use (idempotent, so it survives restarts). */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    this.bucketEnsured = true;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
