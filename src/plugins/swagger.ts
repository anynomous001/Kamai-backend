import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from '../config/env.js';

export const swaggerPlugin = fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Kamai Backend API',
        description:
          'Production-grade Order Management System API for Home Bakers',
        version: '0.1.0',
        contact: {
          name: 'Kamai Engineering Team',
        },
      },
      servers: [
        {
          url: env.APP_URL,
          description:
            env.NODE_ENV === 'production' ? 'Production' : 'Development',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'accessToken',
          },
        },
      },
      tags: [
        { name: 'System', description: 'Health checks and system info' },
        { name: 'Auth', description: 'Authentication and session management' },
        { name: 'Baker', description: 'Baker profile management' },
        { name: 'Orders', description: 'Order management' },
        { name: 'Customers', description: 'Customer management' },
        { name: 'Dashboard', description: 'Dashboard and analytics' },
        { name: 'Billing', description: 'Invoicing and billing' },
        { name: 'Payments', description: 'Payment processing' },
        { name: 'Notifications', description: 'Push and WhatsApp notifications' },
        { name: 'Calendar', description: 'Order calendar and scheduling' },
        { name: 'Investments', description: 'Ingredient and cost tracking' },
        { name: 'Support', description: 'Customer support tickets' },
        { name: 'Uploads', description: 'File upload management' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecificationClone: true,
  });
});
