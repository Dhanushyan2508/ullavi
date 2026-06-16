import { whatsappService } from '../services/whatsapp.service.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../middleware/error.middleware.js';
import { config } from '../config/env.js';

/**
 * Send WhatsApp Message Controller
 * POST /api/whatsapp/send
 * Body: { phone, name }
 */
export const sendWhatsApp = async (req, res, next) => {
  try {
    logger.info('✓ WhatsApp Send Request Received');
    const { phone, name } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      throw new ApiError(400, 'Phone number is required and cannot be empty.');
    }

    // {{1}} = contact name; fall back to "Valued Customer" if missing/blank
    const contactName = (name && typeof name === 'string' && name.trim().length > 0)
      ? name.trim()
      : 'Valued Customer';

    const result = await whatsappService.sendWhatsAppTemplate(phone.trim(), contactName);

    res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully',
      recipient: result.payload?.to,
      messageId: result.response?.messages?.[0]?.id || null
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Test WhatsApp Token Controller
 * GET /api/whatsapp/test-token
 */
export const testWhatsAppToken = async (req, res, next) => {
  try {
    logger.info('GET /api/whatsapp/test-token called');
    const result = await whatsappService.testToken();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Test WhatsApp Template Controller
 * POST /api/whatsapp/test-template
 * Body: { phone, name }
 */
export const testWhatsAppTemplateController = async (req, res, next) => {
  try {
    logger.info('✓ POST /api/whatsapp/test-template called');
    const { phone, name, email, company } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      throw new ApiError(400, 'Phone number is required.');
    }

    const contactName = (name && typeof name === 'string' && name.trim().length > 0) ? name.trim() : 'Test User';
    const details = { name: contactName, email, company };
    
    // Check if token loads successfully
    const tokenExists = !!config.WHATSAPP_ACCESS_TOKEN;
    let tokenValid = false;
    let tokenError = null;

    try {
      const tokenTest = await whatsappService.testToken();
      tokenValid = tokenTest.valid;
      if (!tokenTest.valid) {
        tokenError = tokenTest.error || tokenTest.message || 'Token verification failed';
      }
    } catch (err) {
      tokenError = err.message;
    }

    let metaAccepted = false;
    let messageId = null;
    let apiError = null;
    let responseData = null;
    let finalPayload = null;

    if (tokenExists && tokenValid) {
      try {
        const result = await whatsappService.sendWhatsAppTemplate(phone.trim(), contactName, details);
        metaAccepted = true;
        finalPayload = result.payload;
        responseData = result.response;
        messageId = responseData.messages?.[0]?.id || 'N/A';
      } catch (err) {
        metaAccepted = false;
        apiError = err.message;
        finalPayload = err.payload || null;
        responseData = err.response || null;
      }
    } else {
      apiError = `Token validation failed: ${tokenError || 'Token not valid'}`;
    }

    res.status(200).json({
      success: metaAccepted,
      tokenLoaded: tokenExists,
      tokenValid,
      tokenError,
      metaAccepted,
      messageId,
      error: apiError,
      payload: finalPayload,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};
