import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Role } from './users/role.enum.js';
import { UsersService } from './users/users.service.js';

/**
 * One staff account per role, for Postman/Insomnia. Safe to run repeatedly.
 * Local test logins only: never use these values outside your laptop.
 */
const PASSWORD = 'secret-pass';
const STAFF: { email: string; role: Role }[] = [
  { email: 'admin@jali.rw', role: Role.Admin },
  { email: 'officer@jali.rw', role: Role.LoanOfficer },
  { email: 'auditor@jali.rw', role: Role.Auditor },
];

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
const users = app.get(UsersService);

for (const { email, role } of STAFF) {
  if (await users.findByEmail(email)) {
    console.log(`${email} already exists.`);
  } else {
    await users.create(email, PASSWORD, role);
    console.log(`Created ${email} (${role}).`);
  }
}

await app.close();
