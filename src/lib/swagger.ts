import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Netbanx Dashboard API',
      version: '1.0.0',
      description: 'REST API for Netbanx webhook dashboard integration',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: process.env.NEXTAUTH_URL || 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Session token obtained from login',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'API Key in format: Api-Key YOUR_API_KEY',
        },
      },
      schemas: {
        Transaction: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique transaction identifier',
            },
            externalId: {
              type: 'string',
              description: 'External transaction ID from payment processor',
            },
            merchantRefNum: {
              type: 'string',
              description: 'Merchant reference number',
            },
            amount: {
              type: 'number',
              description: 'Transaction amount',
            },
            currency: {
              type: 'string',
              description: 'Currency code (ISO 4217)',
              example: 'USD',
            },
            status: {
              type: 'string',
              enum: ['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'],
              description: 'Transaction status',
            },
            transactionType: {
              type: 'string',
              enum: ['PAYMENT', 'REFUND', 'PAYOUT', 'CHARGEBACK'],
              description: 'Type of transaction',
            },
            paymentMethod: {
              type: 'string',
              description: 'Payment method used',
              example: 'VISA',
            },
            description: {
              type: 'string',
              description: 'Transaction description',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the transaction was created in our system',
            },
            transactionTime: {
              type: 'string',
              format: 'date-time',
              description: 'When the transaction occurred',
            },
            companyId: {
              type: 'string',
              description: 'Company ID this transaction belongs to',
            },
          },
        },
        WebhookEvent: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique webhook event identifier',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When the webhook was received',
            },
            eventType: {
              type: 'string',
              description: 'Type of webhook event',
              example: 'PAYMENT_COMPLETED',
            },
            source: {
              type: 'string',
              description: 'Source system that sent the webhook',
              example: 'netbanx',
            },
            processed: {
              type: 'boolean',
              description: 'Whether the webhook was successfully processed',
            },
            error: {
              type: 'string',
              description: 'Error message if processing failed',
            },
            payload: {
              type: 'object',
              description: 'Original webhook payload',
            },
            companyId: {
              type: 'string',
              description: 'Company ID this webhook belongs to',
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              description: 'Current page number',
              minimum: 1,
            },
            limit: {
              type: 'integer',
              description: 'Number of items per page',
              minimum: 1,
            },
            total: {
              type: 'integer',
              description: 'Total number of items',
              minimum: 0,
            },
            pages: {
              type: 'integer',
              description: 'Total number of pages',
              minimum: 0,
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the request was successful',
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
            error: {
              type: 'string',
              description: 'Error message if request failed',
            },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/app/api/v1/**/*.ts'], // Path to the API files
};

export function createSwaggerSpec() {
  return swaggerJsdoc(options);
}