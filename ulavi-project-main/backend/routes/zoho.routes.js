import { Router } from 'express';
import { createLead, searchLead, testToken } from '../controllers/zoho.controller.js';

const router = Router();

/**
 * Test Zoho Access Token Service
 * GET /api/zoho/test-token
 */
router.get('/test-token', testToken);

/**
 * Search Zoho Leads
 * GET /api/zoho/search
 */
router.get('/search', searchLead);

/**
 * Create a new Zoho Lead
 * POST /api/zoho/create-lead
 */
router.post('/create-lead', createLead);

export default router;

