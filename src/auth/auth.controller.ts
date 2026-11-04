import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ApiProtected,
  ApiValidationErrorResponse,
} from '../common/api-docs.decorators.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import {
  toUserResponse,
  UserResponseDto,
} from '../users/dto/user-response.dto.js';
import { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in as a staff member and get a JWT' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiValidationErrorResponse()
  @ApiUnauthorizedResponse({
    description: 'Wrong email or password, or the account is blocked.',
    type: ErrorResponseDto,
  })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiProtected()
  @ApiOperation({ summary: 'The logged-in staff member and their role' })
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: User): UserResponseDto {
    return toUserResponse(user);
  }
}
