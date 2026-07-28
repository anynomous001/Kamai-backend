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
   * @param path The full storage key/path
   * @returns True if the object exists
   */
  verifyObjectExists(path: string): Promise<boolean>;

  /**
   * Generates a short-lived signed URL to read an object securely.
   *
   * @param path The full storage key/path
   * @param expiresInSeconds The number of seconds the URL is valid
   * @returns The signed URL or null if an error occurs
   */
  getSignedReadUrl(path: string, expiresInSeconds: number): Promise<string | null>;
}
