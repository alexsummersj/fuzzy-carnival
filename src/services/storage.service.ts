/**
 * File Storage Service
 * Provides abstraction for file storage (local filesystem / S3)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { StorageProvider, UploadedFile } from '@/types';

/**
 * Get the configured storage provider
 */
export function getStorageProvider(): StorageProvider {
  const provider = process.env.FILE_STORAGE_PROVIDER || 'local';

  switch (provider) {
    case 's3':
      return new S3StorageProvider();
    case 'local':
    default:
      return new LocalStorageProvider();
  }
}

/**
 * Local File System Storage Provider
 */
class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = process.env.FILE_STORAGE_PATH || './uploads';
  }

  async upload(file: Buffer, filename: string, mimeType: string): Promise<string> {
    // Generate unique path
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const uniqueId = uuidv4();
    const ext = path.extname(filename) || '.pdf';
    const safeName = `${uniqueId}${ext}`;

    const relativePath = path.join(String(year), month, safeName);
    const fullPath = path.join(this.basePath, relativePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, file);

    return relativePath;
  }

  async download(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, storagePath);
    return fs.readFile(fullPath);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getUrl(storagePath: string): string {
    // For local storage, return a relative API path
    return `/api/files/${encodeURIComponent(storagePath)}`;
  }
}

/**
 * S3 Storage Provider (placeholder implementation)
 */
class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private region: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || '';
    this.region = process.env.AWS_S3_REGION || 'us-east-1';

    if (!this.bucket) {
      console.warn('S3 bucket not configured. File uploads will fail.');
    }
  }

  async upload(file: Buffer, filename: string, mimeType: string): Promise<string> {
    // Generate S3 key
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const uniqueId = uuidv4();
    const ext = path.extname(filename) || '.pdf';
    const key = `uploads/${year}/${month}/${uniqueId}${ext}`;

    // TODO: Implement actual S3 upload using AWS SDK
    // For now, throw error indicating S3 is not fully implemented
    throw new Error('S3 storage not fully implemented. Please configure local storage or implement S3 SDK integration.');

    // Example implementation with AWS SDK v3:
    // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // const client = new S3Client({ region: this.region });
    // await client.send(new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    //   Body: file,
    //   ContentType: mimeType,
    // }));
    // return key;
  }

  async download(storagePath: string): Promise<Buffer> {
    // TODO: Implement S3 download
    throw new Error('S3 download not implemented');
  }

  async delete(storagePath: string): Promise<void> {
    // TODO: Implement S3 delete
    throw new Error('S3 delete not implemented');
  }

  getUrl(storagePath: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${storagePath}`;
  }
}

/**
 * Upload multiple files and return metadata
 */
export async function uploadFiles(
  files: Array<{ buffer: Buffer; originalName: string; mimeType: string; size: number }>
): Promise<UploadedFile[]> {
  const storage = getStorageProvider();
  const results: UploadedFile[] = [];

  for (const file of files) {
    const storagePath = await storage.upload(file.buffer, file.originalName, file.mimeType);
    results.push({
      originalName: file.originalName,
      storagePath,
      mimeType: file.mimeType,
      size: file.size,
    });
  }

  return results;
}

/**
 * Get file URL for download
 */
export function getFileUrl(storagePath: string): string {
  const storage = getStorageProvider();
  return storage.getUrl(storagePath);
}

/**
 * Download file content
 */
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const storage = getStorageProvider();
  return storage.download(storagePath);
}

/**
 * Delete a file
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const storage = getStorageProvider();
  return storage.delete(storagePath);
}
