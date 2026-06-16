import { Router } from 'express';

const router = Router();

/**
 * Health Check Endpoint
 * GET /api/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend running'
  });
});

export default router;
