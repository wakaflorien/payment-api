import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  ApiProtected,
  ApiValidationErrorResponse,
} from '../common/api-docs.decorators.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { toUserResponse, UserResponseDto } from './dto/user-response.dto.js';
import { Role } from './role.enum.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

/** Staff accounts and roles. Admin only. */
@ApiTags('users')
@ApiProtected()
@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List staff users, newest first (admin)' })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a staff user with a role (admin)' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiValidationErrorResponse()
  @ApiConflictResponse({
    description: 'A user with this email already exists.',
    type: ErrorResponseDto,
  })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return toUserResponse(
      await this.usersService.create(dto.email, dto.password, dto.role),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: "Change a user's role or block them (admin)" })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse({
    description: 'User not found.',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Admins cannot demote or deactivate themselves.',
    type: ErrorResponseDto,
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: User,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, actor.id);
  }
}
