import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

/**
 * Masks a secret string for safe logging.
 */
const maskSecret = (value) => {
  if (!value || value.length < 10) return '***';
  return value.substring(0, 8) + '...';
};

/**
 * Token Service
 * Manages Zoho OAuth 2.0 credentials, storage, and automatic refresh cycles.
 */
class TokenService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiryTime = null; // Timestamp when accessToken expires
  }

  /**
   * Retrieves a valid Access Token for Zoho CRM.
   * Checks if an access token exists and is not expired; if expired, fetches a new one.
   * 
   * @returns {Promise<string>} The active Zoho API access token.
   */
  async getAccessToken() {
    // Check if the cached token is still valid (with a 30-second buffer for safety)
    const safetyBuffer = 30 * 1000;
    if (
      this.accessToken &&
      this.tokenExpiryTime &&
      Date.now() < (this.tokenExpiryTime - safetyBuffer)
    ) {
      logger.info('✓ Using cached Zoho Access Token');
      return this.accessToken;
    }

    logger.info('✓ Requesting Zoho Access Token (cached token expired or unavailable)');
    return this.refreshAccessToken();
  }

  /**
   * Refreshes the Zoho CRM Access Token using the REFRESH_TOKEN.
   * 
   * @returns {Promise<string>} The newly fetched Zoho access token.
   */
  async refreshAccessToken() {
    const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } = config;

    // Validate inputs
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      const missing = [];
      if (!CLIENT_ID) missing.push('CLIENT_ID');
      if (!CLIENT_SECRET) missing.push('CLIENT_SECRET');
      if (!REFRESH_TOKEN) missing.push('REFRESH_TOKEN');

      throw new Error(`Cannot refresh Zoho access token. Missing configuration: ${missing.join(', ')}`);
    }
    try {
      const response = await axios.post(`https://accounts.zoho.${config.ZOHO_DOMAIN}/oauth/v2/token`, null, {
        params: {
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: REFRESH_TOKEN
        }
      });

      const data = response.data;

      // Handle Zoho error response embedded in 200 OK
      if (data.error) {
        throw new Error(`Zoho token error: ${data.error}`);
      }

      const { access_token, expires_in } = data;

      if (!access_token) {
        throw new Error('Zoho response did not contain an access_token.');
      }

      this.accessToken = access_token;
      // expires_in is in seconds, convert to millisecond timestamp
      this.tokenExpiryTime = Date.now() + (expires_in * 1000);

      logger.info(`✓ Access Token Generated: ${maskSecret(this.accessToken)}`);
      return this.accessToken;
    } catch (error) {
      const errMsg = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      logger.error(`Failed to refresh Zoho access token: ${errMsg}`);
      throw new Error(`Zoho Access Token Refresh failed: ${errMsg}`);
    }
  }
}

export const tokenService = new TokenService();

/**
 * Reusable function to get Zoho access token.
 */
export const getAccessToken = () => tokenService.getAccessToken();
