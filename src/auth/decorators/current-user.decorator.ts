import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/user.entity.js';

/** Injects the authenticated User entity that JwtAuthGuard loaded: `@CurrentUser() user: User`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<{ user: User }>().user,
);
