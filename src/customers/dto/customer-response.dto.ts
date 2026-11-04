import { ApiProperty } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Aline Uwase' })
  fullName: string;

  @ApiProperty({ example: '0788123456' })
  phone: string;

  @ApiProperty({ example: '1199080012345678' })
  nationalId: string;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: '1-based page number.' })
  page: number;

  @ApiProperty({ example: 15 })
  limit: number;

  @ApiProperty({ example: 17 })
  total: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

export class PaginatedCustomersDto {
  @ApiProperty({ type: [CustomerResponseDto], description: 'Newest first.' })
  data: CustomerResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
