export class TailoringDomainError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, statusCode = 400, code = "TAILORING_ERROR") {
    super(message);
    this.name = "TailoringDomainError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TailoringConflictError extends TailoringDomainError {
  constructor(message = "Cette donnée d’atelier a été modifiée. Rechargez puis réessayez.", code = "TAILORING_REVISION_CONFLICT") {
    super(message, 409, code);
  }
}
