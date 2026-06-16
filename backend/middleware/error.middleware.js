import { logger } from '../utils/logger.js';

// Custom API Error Class
export class ApiError extends Error {
  constructor(statusCode, message, rawError = null) {
    super(message);
    this.statusCode = statusCode;
    this.rawError = rawError;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler middleware
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  // Log the error
  logger.error(`${req.method} ${req.originalUrl} - Error: ${message}`, err);

  const errorResponse = {
    success: false,
    status: statusCode,
    message: message,
  };

  // Include detailed error fields in development/debugging if rawError exists
  if (err.rawError) {
    errorResponse.details = err.rawError;
  }

  res.status(statusCode).json(errorResponse);
};

// Middleware to handle Route Not Found (404)
export const routeNotFound = (req, res, next) => {
  const error = new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`);
  next(error);
};
