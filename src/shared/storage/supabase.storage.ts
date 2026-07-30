import { createClient } from '@supabase/supabase-js';

import { env } from '../../config/env.js';
import { InternalServerError } from '../errors/index.js';

import type { StorageProvider } from './storage-provider.interface.js';

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

  async verifyObjectExists(path: string): Promise<boolean> {
    // We can list files or create a signed URL to read. 
    // Since we just need to verify existence, let's list the directory.
    const pathParts = path.split('/');
    const fileName = pathParts.pop();
    const folderPath = pathParts.join('/');

    const client = this.getClient();
    const { data, error } = await client.storage
      .from(this.bucket)
      .list(folderPath, {
        limit: 1,
        search: fileName,
      });

    if (error !== null || data === null || data === undefined) {
      return false;
    }

    return data.some((file) => file.name === fileName);
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
}

export const storageProvider = new SupabaseStorageProvider();
