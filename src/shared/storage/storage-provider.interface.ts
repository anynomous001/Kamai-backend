export interface StorageProvider {
  /**
   * Generates a short-lived signed URL for uploading directly to object storage.
   *
   * @param path The full storage key/path (e.g., 'business/uuid/logo/file.png')
   * @param contentType The MIME type of the file
   * @param expiresInSeconds The number of seconds the URL is valid
   * @returns An object containing the upload URL and the path
   */
  generateSignedUploadUrl(
    path: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<{ uploadUrl: string; filePath: string; expiresIn: number }>;

  /**
   * Verifies if an object successfully exists at the given path.
   * Useful for confirming a client upload completed.
   *
   * Distinguishes two failure modes rather than collapsing both to `false`:
   * resolves `false` only when the storage API call succeeded and genuinely
   * found no object at `path`. If the API call itself fails (timeout, 5xx,
   * network error) after retrying, it throws `StorageVerificationError`
   * instead — that failure mode is not the caller's fault and must not be
   * reported to the client as "bad path".
   *
   * @param path The full storage key/path
   * @param context Optional fields (e.g. bakerId, category) merged into log entries for this check
   * @returns True if the object exists
   */
  verifyObjectExists(path: string, context?: Record<string, unknown>): Promise<boolean>;

  /**
   * Generates a short-lived signed URL to read an object securely.
   *
   * @param path The full storage key/path
   * @param expiresInSeconds The number of seconds the URL is valid
   * @returns The signed URL or null if an error occurs
   */
  getSignedReadUrl(path: string, expiresInSeconds: number): Promise<string | null>;

  /**
   * Uploads a buffer directly from the server (as opposed to the
   * generateSignedUploadUrl + client-PUT flow, which is for client uploads).
   * Upserts by default — callers that want a stable, reusable path (so
   * regenerating doesn't orphan the previous object) should pass the same
   * path on every call.
   *
   * @param path The full storage key/path
   * @param data The file contents
   * @param contentType The MIME type of the file
   */
  uploadObject(path: string, data: Buffer, contentType: string): Promise<{ filePath: string }>;
}
