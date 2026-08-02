import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks the Supabase client's storage.list() call directly — this is the
// second, independent network round-trip verifyObjectExists() makes to
// Supabase's Storage API *after* the client's direct PUT already completed.
// That's the exact seam where a transient network/API blip used to get
// silently collapsed into "file not found".
const listMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        list: listMock,
      }),
    },
  }),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_STORAGE_BUCKET: 'test-bucket',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    APP_NAME: 'kamai-backend-test',
  },
}));

describe('SupabaseStorageProvider.verifyObjectExists', () => {
  let logger: typeof import('../../src/shared/logger/index.js').logger;
  let StorageVerificationError: typeof import('../../src/shared/errors/index.js').StorageVerificationError;
  let SupabaseStorageProvider: typeof import('../../src/shared/storage/supabase.storage.js').SupabaseStorageProvider;
  let provider: InstanceType<typeof SupabaseStorageProvider>;

  beforeEach(async () => {
    listMock.mockReset();
    vi.restoreAllMocks();
    ({ logger } = await import('../../src/shared/logger/index.js'));
    ({ StorageVerificationError } = await import('../../src/shared/errors/index.js'));
    ({ SupabaseStorageProvider } = await import('../../src/shared/storage/supabase.storage.js'));
    provider = new SupabaseStorageProvider();
  });

  it('returns true on a single successful call when the file is present', async () => {
    listMock.mockResolvedValueOnce({ data: [{ name: 'photo.jpg' }], error: null });

    const result = await provider.verifyObjectExists('baker1/menu-item-photos/photo.jpg');

    expect(result).toBe(true);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('returns false without retrying when the API call succeeds but genuinely finds nothing', async () => {
    listMock.mockResolvedValueOnce({ data: [], error: null });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    const result = await provider.verifyObjectExists('baker1/menu-item-photos/missing.jpg');

    expect(result).toBe(false);
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'baker1/menu-item-photos/missing.jpg' }),
      expect.stringContaining('not found'),
    );
  });

  it('simulates a weak-network/transient blip: retries once and succeeds, logging the real error from the failed attempt', async () => {
    // First attempt fails the way a flaky mobile network or a Supabase API
    // hiccup would — not a fast local success — then the retry succeeds.
    listMock
      .mockResolvedValueOnce({ data: null, error: { message: 'upstream connect error', status: 504 } })
      .mockResolvedValueOnce({ data: [{ name: 'photo.jpg' }], error: null });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const result = await provider.verifyObjectExists('baker1/menu-item-photos/photo.jpg', {
      bakerId: 'baker1',
      category: 'MENU_ITEM_PHOTO',
    });

    expect(result).toBe(true);
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, bakerId: 'baker1', category: 'MENU_ITEM_PHOTO' }),
      expect.stringContaining('list() call failed'),
    );
  });

  it('throws StorageVerificationError (not a silent false) when the storage API keeps failing after retry', async () => {
    listMock.mockResolvedValue({ data: null, error: { message: 'ECONNRESET', status: 500 } });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(
      provider.verifyObjectExists('baker1/logo/photo.png', { bakerId: 'baker1', category: 'BUSINESS_LOGO' }),
    ).rejects.toThrow(StorageVerificationError);

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});
