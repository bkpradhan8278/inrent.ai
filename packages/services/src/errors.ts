/** Errors thrown by services and translated to UI/HTTP responses by callers. */
export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(what = "Resource") {
    super("not_found", `${what} not found.`, 404);
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = "You do not have permission to do that.") {
    super("forbidden", message, 403);
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super("validation_error", message, 400);
  }
}
