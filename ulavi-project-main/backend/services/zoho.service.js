import { getAccessToken } from './token.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import axios from 'axios';

/**
 * Zoho CRM Service
 * Interacts with the Zoho CRM REST API endpoints.
 */
class ZohoService {
  /**
   * Search for an existing lead by email or phone.
   * 
   * Zoho API Endpoint: GET https://www.zohoapis.in/crm/v7/Leads/search
   * Headers: Authorization: Zoho-oauthtoken <ACCESS_TOKEN>
   * 
   * @param {Object} query - Search parameters { email, phone }
   * @returns {Promise<Array>} List of matching records.
   */
  async searchLead({ email, phone }) {
    const accessToken = await getAccessToken();

    // Construct search criteria
    let criteria = '';
    if (email && phone) {
      criteria = `((Email:equals:${email.trim()})or(Phone:equals:${phone.trim()}))`;
    } else if (email) {
      criteria = `(Email:equals:${email.trim()})`;
    } else if (phone) {
      criteria = `(Phone:equals:${phone.trim()})`;
    } else {
      throw new Error('At least email or phone must be provided to search leads.');
    }

    logger.info(`Sending search request to Zoho CRM API → https://www.zohoapis.${config.ZOHO_DOMAIN}/crm/v7/Leads/search?criteria=${criteria}`);

    try {
      const response = await axios.get(`https://www.zohoapis.${config.ZOHO_DOMAIN}/crm/v7/Leads/search`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { criteria }
      });

      // Zoho returns 204 No Content when no records match. Axios resolves it with 204 status.
      if (response.status === 204 || !response.data) {
        return [];
      }

      return response.data.data || [];
    } catch (error) {
      // Catch Zoho 204 if Axios treats it as an error or error response status is 204
      if (error.response?.status === 204) {
        return [];
      }
      const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      logger.error(`Zoho CRM search failed: ${errMsg}`);
      throw new Error(`Zoho CRM search failed: ${errMsg}`);
    }
  }


  /**
   * Create a new Lead in Zoho CRM.
   * 
   * Zoho API Endpoint: POST https://www.zohoapis.in/crm/v7/Leads
   * Headers: Authorization: Zoho-oauthtoken <ACCESS_TOKEN>
   * Body: { data: [ { First_Name: '', Last_Name: '', ... } ] }
   * 
   * @param {Object} leadData - Lead fields parsed from the business card
   * @returns {Promise<Object>} The response from Zoho CRM.
   */
  async createLead(leadData) {
    logger.info('Calling Zoho token service to retrieve access token...');
    const accessToken = await getAccessToken();
    logger.info('✓ Access Token Retrieved');

    logger.info(`Sending lead creation request to Zoho CRM API → https://www.zohoapis.${config.ZOHO_DOMAIN}/crm/v7/Leads`);
    const response = await axios.post(`https://www.zohoapis.${config.ZOHO_DOMAIN}/crm/v7/Leads`, {
      data: [ leadData ]
    }, {
      headers: { 
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }
}

export const zohoService = new ZohoService();
