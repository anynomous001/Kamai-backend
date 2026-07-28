// ============================================================
// SHARED TYPES
// ============================================================

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
  details?: Record<string, unknown>;
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Cursor-based pagination metadata
 */
export interface CursorPaginationMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  count: number;
}

/**
 * Pagination query params
 */
export interface PaginationQuery {
  page?: number;
  perPage?: number;
}

/**
 * Cursor pagination query params
 */
export interface CursorPaginationQuery {
  cursor?: string;
  limit?: number;
  direction?: 'next' | 'prev';
}

/**
 * Sort order
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Authenticated user payload (from JWT)
 */
export interface JwtPayload {
  sub: string;            // Baker DB id (UUID)
  email?: string;          // Baker email
  phoneNumber?: string;    // Phone number (optional)
  sessionId: string;      // Maps to RefreshToken.id in DB
  iat: number;
  exp: number;
}

/**
 * User roles (kept for future admin workflows)
 */
export enum UserRole {
  BAKER = 'BAKER',
  ADMIN = 'ADMIN',
}

/**
 * Fastify request augmentation (populated by auth middleware)
 */
export interface AuthenticatedUser {
  id: string;             // Baker DB id (= sub)
  email?: string;
  phoneNumber?: string;
  sessionId: string;
  bakerId?: string;       // Development bypass support
  phone?: string;         // Development bypass support
}

