export class DatabaseError extends Error {
  public code?: string;
  public details?: string;
  public hint?: string;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'DatabaseError';

    if (originalError && typeof originalError === 'object') {
      const err = originalError as Record<string, unknown>;
      this.code = err.code as string | undefined;
      this.details = err.details as string | undefined;
      this.hint = err.hint as string | undefined;
    }
  }
}

/**
 * Error nghiệp vụ với message ĐÃ Việt hóa, AN TOÀN để trả thẳng ra client
 * (vd: "Nhóm này đã có Leader..."). toClientError sẽ pass-through loại này.
 */
export class ClientSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientSafeError';
  }
}

/**
 * Map lỗi server → message cho client (A4): chặn lộ message Postgres/Supabase thô
 * (chứa tên bảng/cột/constraint). Message gốc chỉ log server-side.
 * - ClientSafeError → trả nguyên message (business message chủ đích).
 * - Mọi lỗi khác → trả `fallbackVi`, log full ở server.
 */
export function toClientError(err: unknown, fallbackVi: string): string {
  if (err instanceof ClientSafeError) {
    return err.message;
  }
  console.error('[server-error]', fallbackVi, err);
  return fallbackVi;
}
