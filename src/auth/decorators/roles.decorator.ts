import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenRoleResponse } from '../../common/api-docs.decorators.js';
import { Role } from '../../users/role.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or controller) to these roles; RolesGuard returns 403 otherwise.
 * Without @Roles, any authenticated user may call the route.
 * Method-level @Roles overrides controller-level @Roles.
 */
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiForbiddenRoleResponse());
