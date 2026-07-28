import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export const helmetPlugin = fp(async (app) => {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI needs this
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for Swagger UI
  });
});
