export class DatabaseError extends Error {
  public code?: string;
  public details?: string;
  public hint?: string;

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
    
    if (originalError) {
      this.code = originalError.code;
      this.details = originalError.details;
      this.hint = originalError.hint;
    }
  }
}
