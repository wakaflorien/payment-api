import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from './dto/error-response.dto.js';

/** Marks a controller or route as requiring `Authorization: Bearer <jwt>`. */
export function ApiProtected() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: 'Missing, expired or invalid bearer token.',
      type: ErrorResponseDto,
    }),
  );
}

/** The 403 returned by RolesGuard when the user's role isn't allowed. */
export function ApiForbiddenRoleResponse() {
  return ApiForbiddenResponse({
    description: "The authenticated user's role is not allowed here.",
    type: ErrorResponseDto,
  });
}

/** The 400 that the global ValidationPipe returns for invalid input. */
export function ApiValidationErrorResponse() {
  return ApiBadRequestResponse({
    description: 'Invalid input. `message` lists every problem.',
    type: ErrorResponseDto,
  });
}
