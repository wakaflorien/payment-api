import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { isDuplicateEntry } from '../common/is-duplicate-entry.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { toUserResponse, UserResponseDto } from './dto/user-response.dto.js';
import { Role } from './role.enum.js';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async create(
    email: string,
    password: string,
    role: Role = Role.LoanOfficer,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      return await this.users.save(
        this.users.create({ email: email.toLowerCase(), passwordHash, role }),
      );
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.users.find({ order: { id: 'DESC' } });

    return users.map(toUserResponse);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: email.toLowerCase() });
  }

  findById(id: number): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** `actorId` is the admin making the change, so admins can't lock themselves out. */
  async update(
    id: number,
    dto: UpdateUserDto,
    actorId: number,
  ): Promise<UserResponseDto> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (id === actorId && dto.role !== undefined && dto.role !== Role.Admin) {
      throw new UnprocessableEntityException(
        'You cannot remove your own admin role.',
      );
    }
    if (id === actorId && dto.isActive === false) {
      throw new UnprocessableEntityException(
        'You cannot deactivate your own account.',
      );
    }

    Object.assign(user, dto);

    return toUserResponse(await this.users.save(user));
  }
}
