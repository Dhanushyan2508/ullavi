import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

/**
 * WhatsApp Service
 * Handles template messaging using the Meta WhatsApp Cloud API (v25.0).
 */
class WhatsappService {
  /**
   * Sends the approved test template to the specified phone number.
   * 
   * Meta API Endpoint: POST https://graph.facebook.com/v25.0/{Phone-Number-ID}/messages
   * Headers: Authorization: Bearer {Access-Token}
   * 
   * @param {string} phone - Recipient phone number
   * @returns {Promise<Object>} Meta API response details
   */
   async sendWhatsAppTemplate(phone, contactName = 'Valued Customer') {
    const {
      WHATSAPP_ACCESS_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_GRAPH_API_VERSION,
      WHATSAPP_TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANGUAGE_CODE,
      WHATSAPP_BUSINESS_PHONE
    } = config;

    // ── 1. Validate required configuration ──────────────────────────────────
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      const missing = [];
      if (!WHATSAPP_ACCESS_TOKEN) missing.push('WHATSAPP_ACCESS_TOKEN');
      if (!WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
      logger.error(`[WhatsApp] Missing config: ${missing.join(', ')}`);
      throw new Error(`WhatsApp API configuration is missing: ${missing.join(', ')}`);
    }

    // ── 2. Runtime values (logged before any API call) ──────────────────────
    const templateName = WHATSAPP_TEMPLATE_NAME || 'cardsync_contact_saved';
    const languageCode = WHATSAPP_TEMPLATE_LANGUAGE_CODE || 'en';
    const apiVersion   = WHATSAPP_GRAPH_API_VERSION || 'v25.0';

    logger.info('[WhatsApp] ── PRE-FLIGHT AUDIT ──────────────────────────────');
    logger.info(`[WhatsApp] WHATSAPP_TEMPLATE_NAME         = ${templateName}`);
    logger.info(`[WhatsApp] WHATSAPP_TEMPLATE_LANGUAGE_CODE= ${languageCode}`);
    logger.info(`[WhatsApp] WHATSAPP_PHONE_NUMBER_ID       = ${WHATSAPP_PHONE_NUMBER_ID}`);

    // ── 3. Normalize recipient phone to E.164 (digits only) ─────────────────
    const cleanPhone         = String(phone).trim().replace(/[^0-9]/g, '');
    const cleanBusinessPhone = WHATSAPP_BUSINESS_PHONE
      ? String(WHATSAPP_BUSINESS_PHONE).trim().replace(/[^0-9]/g, '')
      : '';

    if (!cleanPhone) {
      throw new Error('Recipient phone number is empty after normalization.');
    }
    if (cleanPhone === cleanBusinessPhone) {
      throw new Error('Cannot send WhatsApp template to the business sender number.');
    }

    // ── 4. Resolve contact name — exactly ONE parameter for {{1}} ────────────
    const resolveContactName = (raw) => {
      if (!raw || typeof raw !== 'string') return 'Valued Customer';
      const t = raw.trim();
      const l = t.toLowerCase();
      if (
        t === '' || t === '—' || t === 'N/A' ||
        l === 'not provided' || l === 'not available' ||
        l === 'unknown' || l === 'unknown name' || l === 'unknown company'
      ) return 'Valued Customer';
      return t;
    };
    const greetingName = resolveContactName(contactName);

    // ── 5. Build exact payload ───────────────────────────────────────────────
    // Template: cardsync_contact_saved  |  Language: en  |  Body params: 1 ({{1}} = name)
    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: greetingName }   // {{1}} → contact name
            ]
          }
        ]
      }
    };

    const url = `https://graph.facebook.com/${apiVersion}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    // ── 6. Pre-flight log ────────────────────────────────────────────────────
    logger.info('[WhatsApp] ── PRE-CALL DETAILS ──────────────────────────────');
    logger.info(`[WhatsApp] Template name   : ${templateName}`);
    logger.info(`[WhatsApp] Language code   : ${languageCode}`);
    logger.info(`[WhatsApp] Recipient phone : ${cleanPhone}`);
    logger.info(`[WhatsApp] Contact name ({{1}}): ${greetingName}`);
    logger.info(`[WhatsApp] Body param count: 1`);
    logger.info(`[WhatsApp] Graph API URL   : ${url}`);
    logger.info(`[WhatsApp] Payload:\n${JSON.stringify(payload, null, 2)}`);

    // ── 7. Call Meta API ─────────────────────────────────────────────────────
    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      const httpStatus    = response.status;
      const responseBody  = response.data;
      const messageId     = responseBody.messages?.[0]?.id || 'N/A';
      const messageStatus = responseBody.messages?.[0]?.message_status || 'accepted';

      logger.info('[WhatsApp] ── META RESPONSE ─────────────────────────────────');
      logger.info(`[WhatsApp] HTTP Status    : ${httpStatus}`);
      logger.info(`[WhatsApp] Message ID     : ${messageId}`);
      logger.info(`[WhatsApp] Message Status : ${messageStatus}`);
      logger.info(`[WhatsApp] Full response  : ${JSON.stringify(responseBody)}`);

      return { payload, response: responseBody };

    } catch (error) {
      const httpStatus   = error.response?.status || 'N/A';
      const responseBody = error.response?.data || {};
      const errMsg       = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

      logger.error('[WhatsApp] ── META ERROR RESPONSE ───────────────────────────');
      logger.error(`[WhatsApp] HTTP Status     : ${httpStatus}`);
      logger.error(`[WhatsApp] Template Name   : ${templateName}`);
      logger.error(`[WhatsApp] Language Code   : ${languageCode}`);
      logger.error(`[WhatsApp] Phone Number ID : ${WHATSAPP_PHONE_NUMBER_ID}`);
      logger.error(`[WhatsApp] Recipient       : ${cleanPhone}`);
      logger.error(`[WhatsApp] Full Meta error : ${errMsg}`);

      const customError = new Error(`Meta API error: ${errMsg}`);
      customError.payload  = payload;
      customError.response = responseBody;
      throw customError;
    }
  }

  /**
   * Verifies the configured WHATSAPP_ACCESS_TOKEN.
   * 
   * @returns {Promise<Object>} Status of the token
   */
  async testToken() {
    const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_GRAPH_API_VERSION } = config;
    if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === 'your_whatsapp_access_token_here') {
      return { valid: false, error: 'Token is unconfigured or a placeholder.' };
    }
    const apiVersion = WHATSAPP_GRAPH_API_VERSION || 'v25.0';
    try {
      const response = await axios.get(`https://graph.facebook.com/${apiVersion}/me`, {
        headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
      });
      return { valid: true, name: response.data.name, id: response.data.id };
    } catch (error) {
      const data = error.response?.data?.error || {};
      return {
        valid: false,
        message: data.message || error.message,
        code: data.code,
        type: data.type
      };
    }
  }
}

export const whatsappService = new WhatsappService();
