import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env immediately
dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  CLIENT_ID: process.env.CLIENT_ID || '',
  CLIENT_SECRET: process.env.CLIENT_SECRET || '',
  REFRESH_TOKEN: process.env.REFRESH_TOKEN || '',
  REDIRECT_URI: process.env.REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  ZOHO_DOMAIN: process.env.ZOHO_DOMAIN || 'in',
  NODE_ENV: process.env.NODE_ENV || 'development',
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_GRAPH_API_VERSION: process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0',
  WHATSAPP_TEMPLATE_NAME: process.env.WHATSAPP_TEMPLATE_NAME || '',
  WHATSAPP_TEMPLATE_LANGUAGE_CODE: process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE || '',
  WHATSAPP_BUSINESS_PHONE: process.env.WHATSAPP_BUSINESS_PHONE || ''
};

// Validations helper returning errors/warnings
export const getEnvValidationResult = () => {
  const missing = [];
  
  if (!config.CLIENT_ID) missing.push('CLIENT_ID');
  if (!config.CLIENT_SECRET) missing.push('CLIENT_SECRET');
  if (!config.REFRESH_TOKEN) missing.push('REFRESH_TOKEN');

  return {
    isValid: missing.length === 0,
    missingVariables: missing
  };
};
