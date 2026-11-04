import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The JSON body Nest's built-in HTTP exceptions return for every 4xx error. */
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({
    description:
      'A sentence, or one sentence per invalid field for validation errors (400).',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Loan not found.',
  })
  message: string | string[];

  @ApiPropertyOptional({ example: 'Not Found' })
  error?: string;
}
