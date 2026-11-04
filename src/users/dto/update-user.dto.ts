import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../role.enum.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: Role, enumName: 'Role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    example: false,
    description: 'false blocks login and invalidates existing tokens.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
