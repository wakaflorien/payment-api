import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Aline Uwase', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  /** Rwandan mobile: 078/079 (MTN) or 072/073 (Airtel), 10 digits in total. */
  @ApiProperty({
    description:
      'Rwandan mobile number: 078/079 (MTN) or 072/073 (Airtel). Unique.',
    pattern: '^07[2389]\\d{7}$',
    example: '0788123456',
  })
  @IsString()
  @Matches(/^07[2389]\d{7}$/, {
    message: 'phone must be a Rwandan mobile number like 0788123456',
  })
  phone: string;

  @ApiProperty({
    description: 'National ID number, exactly 16 digits. Unique.',
    pattern: '^\\d{16}$',
    example: '1199080012345678',
  })
  @IsString()
  @Matches(/^\d{16}$/, { message: 'nationalId must be exactly 16 digits' })
  nationalId: string;
}
