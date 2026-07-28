/**
 * Cache Service Interface
 * Defines the contract for invalidating dashboard caches.
 */
export interface CacheService {
  invalidateDashboardSummary(bakerId: string): Promise<void>;
}

/**
 * NoOp Cache Service
 *
 * A stub implementation for the CacheService.
 * When Redis is integrated in a later action, this will be swapped out
 * with a RedisCacheService implementation.
 */
export class NoOpCacheService implements CacheService {
  async invalidateDashboardSummary(_bakerId: string): Promise<void> {
    // Stub: Do nothing.
    return Promise.resolve();
  }
}

// Singleton instance to be used across the application
export const cacheService: CacheService = new NoOpCacheService();
