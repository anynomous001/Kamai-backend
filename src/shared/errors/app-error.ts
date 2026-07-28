// ============================================================
// TYPED ERROR CLASSES
// ============================================================
// Centralised error hierarchy for the Kamai backend.
// All thrown errors must extend AppError for consistent
// JSON responses across the API.
// ============================================================

export type ErrorCode =
  // Generic
  | 'INTERNAL_SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'GONE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'BAD_REQUEST'
  | 'SERVICE_UNAVAILABLE'
  | 'SUPPORT_NOT_CONFIGURED'
  // Auth
  | 'INVALID_CREDENTIALS'
  | 'OTP_EXPIRED'
  | 'OTP_MAX_ATTEMPTS_EXCEEDED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'FIREBASE_TOKEN_INVALID'
  | 'FIREBASE_TOKEN_EXPIRED'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'SESSION_NOT_FOUND'
  // Business
  | 'ORDER_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PAYMENT_FAILED'
  | 'INVOICE_NOT_FOUND'
  | 'BAKER_NOT_FOUND'
  | 'INVALID_ORDER_STATUS_TRANSITION'
  | 'ORDER_ALREADY_CANCELLED'
  | 'ORDER_ALREADY_DELIVERED';


export interface AppErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly details?: AppErrorDetails;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    errorCode: ErrorCode,
    details?: AppErrorDetails,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = isOperational;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ── 400 Bad Request ──────────────────────────────────────────
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: AppErrorDetails) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

// ── 401 Unauthorized ─────────────────────────────────────────
export class UnauthorizedError extends AppError {
  constructor(
    message = 'Unauthorized',
    errorCode: ErrorCode = 'UNAUTHORIZED',
    details?: AppErrorDetails,
  ) {
    super(message, 401, errorCode, details);
  }
}

// ── 403 Forbidden ────────────────────────────────────────────
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: AppErrorDetails) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

// ── 404 Not Found ────────────────────────────────────────────
export class NotFoundError extends AppError {
  constructor(
    message = 'Resource not found',
    errorCode: ErrorCode = 'NOT_FOUND',
    details?: AppErrorDetails,
  ) {
    super(message, 404, errorCode, details);
  }
}

// ── 410 Gone ─────────────────────────────────────────────────
export class GoneError extends AppError {
  constructor(
    message = 'Resource no longer available',
    errorCode: ErrorCode = 'GONE',
    details?: AppErrorDetails,
  ) {
    super(message, 410, errorCode, details);
  }
}


// ── 409 Conflict ─────────────────────────────────────────────
export class ConflictError extends AppError {
  constructor(
    message = 'Conflict',
    errorCode: ErrorCode = 'CONFLICT',
    details?: AppErrorDetails,
  ) {
    super(message, 409, errorCode, details);
  }
}

// ── 422 Validation Error ─────────────────────────────────────
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: AppErrorDetails) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

// ── 429 Too Many Requests ────────────────────────────────────
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', details?: AppErrorDetails) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
  }
}

// ── 503 Service Unavailable ───────────────────────────────────
export class ServiceUnavailableError extends AppError {
  constructor(
    message = 'Service unavailable',
    errorCode: ErrorCode = 'SERVICE_UNAVAILABLE',
    details?: AppErrorDetails,
  ) {
    super(message, 503, errorCode, details);
  }
}

// ── 500 Internal Server Error ────────────────────────────────
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: AppErrorDetails) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details, false);
  }
}
