import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../role.enum.js';
import { User } from '../user.entity.js';

/** What the API returns for a user. Never includes the password hash. */
export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'officer@jali.rw' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.LoanOfficer })
  role: Role;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}
