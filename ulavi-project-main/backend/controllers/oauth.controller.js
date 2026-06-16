import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Masks a secret string for safe logging.
 * Shows the first 8 characters then replaces the rest with dots.
 * Example: "1000.abcd..." 
 */
const maskSecret = (value) => {
  if (!value || value.length < 10) return '***';
  return value.substring(0, 8) + '...';
};

/**
 * OAuth Callback Handler
 * GET /oauth/callback?code=<authorization_code>
 *
 * Exchanges the Zoho authorization code for access_token + refresh_token,
 * saves the full response to token-response.json, and returns a success page.
 */
export const handleOAuthCallback = async (req, res) => {
  const { code } = req.query;

  // ── Validate authorization code ──
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    logger.error('OAuth callback received without a valid authorization code.');
    return res.status(400).json({
      success: false,
      message: 'Missing or empty authorization code. Zoho must redirect with ?code=<value>.'
    });
  }

  logger.info('Authorization code received from Zoho redirect.');

  // ── Validate required credentials ──
  if (!config.CLIENT_ID || !config.CLIENT_SECRET) {
    logger.error('CLIENT_ID or CLIENT_SECRET is not configured in .env');
    return res.status(500).json({
      success: false,
      message: 'Server misconfiguration: OAuth client credentials are missing from .env'
    });
  }

  try {
    logger.info('Token exchange request started → Zoho OAuth server...');

    // ── Exchange authorization code for tokens ──
    const response = await axios.post(`https://accounts.zoho.${config.ZOHO_DOMAIN}/oauth/v2/token`, null, {
      params: {
        grant_type: 'authorization_code',
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
        redirect_uri: config.REDIRECT_URI,
        code: code.trim()
      }
    });

    const data = response.data;

    // ── Check for Zoho-level errors ──
    if (data.error) {
      logger.error(`Zoho token error: ${data.error}`);
      return res.status(400).json({
        success: false,
        message: `Zoho OAuth error: ${data.error}`,
        details: data
      });
    }

    const { access_token, refresh_token, expires_in } = data;

    if (!access_token) {
      logger.error('Zoho response did not contain an access_token.');
      return res.status(502).json({
        success: false,
        message: 'Zoho returned an unexpected response without access_token.',
        details: data
      });
    }

    // ── Log success (masked values only — never full secrets) ──
    logger.info('Token exchange response received successfully.');
    logger.info(`✓ Access Token Generated: ${maskSecret(access_token)}`);
    if (refresh_token) {
      logger.info(`✓ Refresh Token Generated: ${maskSecret(refresh_token)}`);
    } else {
      logger.warn('⚠ No refresh_token in response. Zoho only returns it on the first exchange.');
    }
    logger.info(`  Token expires in: ${expires_in} seconds`);

    // ── Persist tokens to backend/token-response.json ──
    const tokenFilePath = path.join(__dirname, '../token-response.json');
    const tokenData = {
      access_token,
      refresh_token: refresh_token || null,
      expires_in,
      generated_at: new Date().toISOString()
    };

    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
    logger.info(`✓ Token response saved to token-response.json`);

    // ── Return a human-readable success page ──
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Zoho OAuth Success</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 48px;
            max-width: 560px;
            width: 90%;
            text-align: center;
          }
          h1 { color: #22c55e; font-size: 1.6rem; margin-bottom: 24px; }
          .check { font-size: 3rem; margin-bottom: 16px; }
          .field { margin: 16px 0; text-align: left; }
          .field label { color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 4px; }
          .field code {
            display: block;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: 12px;
            font-size: 0.82rem;
            word-break: break-all;
            color: #facc15;
          }
          .warn { color: #f97316; font-size: 0.85rem; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✅</div>
          <h1>Zoho OAuth Success</h1>
          <div class="field">
            <label>Access Token</label>
            <code>${maskSecret(access_token)}</code>
          </div>
          ${refresh_token ? `
          <div class="field">
            <label>Refresh Token (copy this into your .env REFRESH_TOKEN)</label>
            <code>${refresh_token}</code>
          </div>` : `
          <div class="field">
            <label>Refresh Token</label>
            <code>Not returned — Zoho only provides this on the first code exchange</code>
          </div>`}
          <div class="field">
            <label>Expires In</label>
            <code>${expires_in} seconds</code>
          </div>
          <p class="warn">
            ⚠ Copy the Refresh Token above into your <strong>.env</strong> file now.<br>
            This value is also saved in <strong>token-response.json</strong>.
          </p>
        </div>
      </body>
      </html>
    `;

    return res.status(200).send(html);

  } catch (error) {
    // ── Handle Axios / network errors ──
    if (error.response) {
      // Zoho returned an HTTP error
      logger.error(`Zoho token exchange failed: ${error.response.status}`, error.response.data);
      return res.status(error.response.status).json({
        success: false,
        message: 'Zoho OAuth token exchange failed.',
        status: error.response.status,
        details: error.response.data
      });
    } else if (error.request) {
      // No response received (network issue)
      logger.error('No response from Zoho OAuth server — network failure.', error);
      return res.status(502).json({
        success: false,
        message: 'Could not reach Zoho OAuth server. Check your network connection.'
      });
    } else {
      // Unexpected error
      logger.error('Unexpected error during OAuth token exchange.', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred during the token exchange.',
        error: error.message
      });
    }
  }
};
