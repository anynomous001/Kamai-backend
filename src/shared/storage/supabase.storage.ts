import { createClient } from '@supabase/supabase-js';

import { env } from '../../config/env.js';
import { InternalServerError, StorageVerificationError } from '../errors/index.js';
import { logger } from '../logger/index.js';

import type { StorageProvider } from './storage-provider.interface.js';

const VERIFY_MAX_ATTEMPTS = 2;
const VERIFY_RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SupabaseStorageProvider implements StorageProvider {
  private supabase: ReturnType<typeof createClient> | null = null;
  private bucket: string;

  constructor() {
    this.bucket = env.SUPABASE_STORAGE_BUCKET;
  }

  private getClient(): ReturnType<typeof createClient> {
    if (!this.supabase) {
      if (
        !env.SUPABASE_URL ||
        !env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        throw new Error('Supabase Storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      }
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return this.supabase;
  }

  async generateSignedUploadUrl(
    path: string,
    _contentType: string,
    expiresInSeconds: number = 300,
  ): Promise<{ uploadUrl: string; filePath: string; expiresIn: number }> {
    const client = this.getClient();
    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw new InternalServerError(`Failed to generate signed URL: ${error.message}`);
    }

    // The Supabase generateUploadUrl actually has its own expiry internally (default 60s for creating the URL or 2 hours for token validity usually). 
    // Wait, the SDK's `createSignedUploadUrl` does not accept `expiresIn` yet in the standard API, it just returns a signed URL that is valid for 2 hours.
    // The returned object has { signedUrl, path, token }.
    return {
      uploadUrl: data.signedUrl,
      filePath: path,
      expiresIn: expiresInSeconds, // we just pass through what we intended
    };
  }

  async verifyObjectExists(path: string, context: Record<string, unknown> = {}): Promise<boolean> {
    // We can list files or create a signed URL to read.
    // Since we just need to verify existence, let's list the directory.
    const pathParts = path.split('/');
    const fileName = pathParts.pop();
    const folderPath = pathParts.join('/');

    const client = this.getClient();

    // The list() call is a second, independent network round-trip to Supabase's
    // Storage API — separate from the client's direct PUT that already happened.
    // A transient failure here (timeout, 5xx, connection reset) must NOT be
    // treated the same as "the file genuinely isn't there": that conflation is
    // what made past intermittent upload-submit failures unloggable and
    // indistinguishable from real user error. Retry once, then fail loudly.
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt += 1) {
      const { data, error } = await client.storage
        .from(this.bucket)
        .list(folderPath, {
          limit: 1,
          search: fileName,
        });

      if (error === null && data !== null && data !== undefined) {
        const found = data.some((file) => file.name === fileName);
        if (!found) {
          logger.warn(
            { path, attempt, ...context },
            'Storage verify: list() succeeded but object was not found at path',
          );
        }
        return found;
      }

      lastError = error;
      logger.error(
        { path, attempt, err: error, ...context },
        'Storage verify: list() call failed',
      );

      if (attempt < VERIFY_MAX_ATTEMPTS) {
        await delay(VERIFY_RETRY_DELAY_MS);
      }
    }

    throw new StorageVerificationError(
      'Failed to verify uploaded file due to a storage service error',
      {
        path,
        ...context,
        cause:
          lastError instanceof Error
            ? lastError.message
            : lastError !== null && typeof lastError === 'object'
              ? JSON.stringify(lastError)
              : String(lastError),
      },
    );
  }

  async getSignedReadUrl(path: string, expiresInSeconds: number = 3600): Promise<string | null> {
    const client = this.getClient();
    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error !== null || data === null || data === undefined) {
      return null;
    }

    return data.signedUrl;
  }

  async uploadObject(path: string, data: Buffer, contentType: string): Promise<{ filePath: string }> {
    const client = this.getClient();
    const { error } = await client.storage
      .from(this.bucket)
      .upload(path, data, { contentType, upsert: true });

    if (error) {
      throw new InternalServerError(`Failed to upload object: ${error.message}`);
    }

    return { filePath: path };
  }
}

export const storageProvider = new SupabaseStorageProvider();
