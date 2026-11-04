import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const VALID_REQUEST_ID = /^[\w.-]{1,64}$/;

/**
 * Gives every request an id and writes one access-log line when it finishes.
 *
 * - Reuses a well-formed incoming X-Request-Id (from the load balancer or the Next.js
 *   app) so one id follows a request across services; otherwise generates one.
 * - Echoes it in the X-Request-Id response header, so support can ask a user for it.
 * - Logs the path without the query string, and never bodies or headers, because those
 *   can carry tokens and phone numbers.
 */
export function requestContext(logger = new Logger('HTTP')) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    const started = process.hrtime.bigint();
    response.on('finish', () => {
      const entry = {
        message: 'request completed',
        requestId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        status: response.statusCode,
        durationMs:
          Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
      };
      if (response.statusCode >= 500) {
        logger.error(entry);
      } else if (response.statusCode >= 400) {
        logger.warn(entry);
      } else {
        logger.log(entry);
      }
    });

    next();
  };
}
