import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Normalizes all errors to the plan's shape (§60):
 *   { success: false, error: { code, message } }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    if (!(exception instanceof HttpException)) {
      console.error('DEBUG UNCAUGHT NAME', (exception as Error)?.name, (exception as Error)?.message);
      console.error('DEBUG UNCAUGHT FULL', JSON.stringify(exception, Object.getOwnPropertyNames(exception as object)));
    }

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as { message?: string }).message ?? message;
      // Derive a stable code from the status.
      code = HttpStatus[status] ?? code;
    }

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }
}
