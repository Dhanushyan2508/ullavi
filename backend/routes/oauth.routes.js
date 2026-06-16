import { Router } from 'express';
import { handleOAuthCallback } from '../controllers/oauth.controller.js';

const router = Router();

/**
 * Zoho OAuth Callback
 * GET /oauth/callback?code=<authorization_code>
 *
 * Zoho redirects here after the user grants consent.
 * The controller exchanges the code for access + refresh tokens.
 */
router.get('/callback', handleOAuthCallback);

export default router;
