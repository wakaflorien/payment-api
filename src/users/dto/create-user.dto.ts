import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../role.enum.js';

export class CreateUserDto {
  @ApiProperty({ example: 'jeandoe@jali.rw' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.LoanOfficer })
  @IsEnum(Role)
  role: Role;
}
