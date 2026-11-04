import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { User } from '../../users/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}

/**
 * Global guard (APP_GUARD): every route requires `Authorization: Bearer <jwt>`
 * unless it is marked @Public().
 *
 * The user is reloaded from the database on each request, so deactivating
 * someone or changing their role takes effect immediately, not when the token
 * expires. The `role` claim in the token is informational only.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    request.user = user;

    return true;
  }
}
