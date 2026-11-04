import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/role.enum.js';
import { User } from '../../users/user.entity.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Global guard that runs after JwtAuthGuard. If the route (or its controller)
 * has @Roles(...), the authenticated user's role must be one of them.
 * 401 = "who are you?" (JwtAuthGuard). 403 = "you may not do this" (here).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to do this.');
    }

    return true;
  }
}
