import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { PROVIDER_AUTH } from './payments/payment-callbacks.controller.js';

export const SWAGGER_PATH = 'api/docs';

/** Builds the OpenAPI document from the controllers' and DTOs' decorators. */
export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Jali loan API')
    .setDescription(
      'Loan officers register customers, disburse loans and record mobile money repayments. ' +
        'All amounts are whole Rwandan francs (RWF). ' +
        'Call POST /api/auth/login, then click **Authorize** and paste the `accessToken`.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'The accessToken returned by POST /api/auth/login.',
    })
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description:
          'Payment providers only: the per-provider callback token. Callbacks also need X-Timestamp and X-Signature.',
      },
      PROVIDER_AUTH,
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

/** Serves Swagger UI at /api/docs and the raw JSON at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createSwaggerDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
