import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request } from 'express';

/**
 * Last line of error handling.
 * - HttpExceptions (4xx and deliberate 5xx) keep Nest's usual JSON body.
 * - Anything else (a database error, a bug) is logged with its stack and request id,
 *   and the client only gets a generic 500: no SQL, table names or stack traces leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse();
    const where = {
      requestId: request.header('x-request-id'),
      method: request.method,
      path: request.originalUrl?.split('?')[0],
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500) {
        this.logger.error({ message: exception.message, ...where, status });
      }
      httpAdapter.reply(
        response,
        typeof body === 'string' ? { statusCode: status, message: body } : body,
        status,
      );
      return;
    }

    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      { message: `Unhandled ${error.name}: ${error.message}`, ...where },
      error.stack,
    );
    httpAdapter.reply(
      response,
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
