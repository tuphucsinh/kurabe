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
