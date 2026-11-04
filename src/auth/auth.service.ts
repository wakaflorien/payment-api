import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { JwtPayload } from './guards/jwt-auth.guard.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.usersService.findByEmail(email);

    // One error for unknown email, wrong password and blocked account, so emails can't be enumerated.
    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
