import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'officer@jali.rw' })
  @IsEmail()
  email: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
