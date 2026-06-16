import express from 'express';
import cors from 'cors';
import { config, getEnvValidationResult } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, routeNotFound } from './middleware/error.middleware.js';
import healthRoutes from './routes/health.routes.js';
import zohoRoutes from './routes/zoho.routes.js';
import oauthRoutes from './routes/oauth.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';

const app = express();
const PORT = config.PORT;

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Enable parsing of JSON payloads
app.use(express.json());

// Enable URL-encoded payloads parsing (useful for future webhook integrations)
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use(logger.requestLogger);

// API Routing Setup
app.use('/api', healthRoutes); // GET /api/health
app.use('/api/zoho', zohoRoutes); // GET /api/zoho/search, POST /api/zoho/create-lead
app.use('/api/whatsapp', whatsappRoutes); // POST /api/whatsapp/send
app.use('/oauth', oauthRoutes);   // GET /oauth/callback  (Zoho OAuth redirect)

app.get('/debug-routes', (req, res) => {
  const routes = [];
  const inspectRoutes = (stack, prefix = '') => {
    stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${prefix}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle.stack) {
        let routePrefix = layer.regexp.source
          .replace('\\/?(?=\\/|$)', '')
          .replace('^\\/', '/')
          .replace('^', '')
          .replace('\\/', '/');
        // Handle cleaning regex patterns for simple prefixes
        if (routePrefix === '/api/whatsapp') routePrefix = '/api/whatsapp';
        if (routePrefix === '/api/zoho') routePrefix = '/api/zoho';
        if (routePrefix === '/oauth') routePrefix = '/oauth';
        inspectRoutes(layer.handle.stack, prefix + routePrefix);
      }
    });
  };
  inspectRoutes(app._router.stack);
  res.json({
    whatsappRoutesMounted: true,
    hasTestTemplateRoute: routes.some(r => r.includes('/api/whatsapp/test-template')),
    routes
  });
});

// Catch-all for non-matching routes (404 Not Found)
app.use(routeNotFound);

// Centralized error handling middleware
app.use(errorHandler);

// Start the server
const server = app.listen(PORT, () => {
  // ── Startup validation ──
  logger.info('✓ Environment Loaded');
  logger.info(`✓ Port Loaded (${PORT})`);
  logger.info(`  NODE_ENV: ${config.NODE_ENV}`);

  // Warn about any missing Zoho credentials (never log actual values)
  const { isValid, missingVariables } = getEnvValidationResult();
  if (!isValid) {
    missingVariables.forEach((varName) => {
      logger.warn(`Warning: ${varName} not configured`);
    });
    logger.warn('Zoho CRM integration will not work until all credentials are provided in .env');
  } else {
    logger.info('✓ All Zoho CRM credentials detected');
  }

  logger.info('Server is ready for requests.');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection detected:', err);
  // Graceful shutdown
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception detected:', err);
  // Graceful shutdown
  server.close(() => process.exit(1));
});
