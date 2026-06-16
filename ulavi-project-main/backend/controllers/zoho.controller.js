import { zohoService } from '../services/zoho.service.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../middleware/error.middleware.js';
import { getAccessToken } from '../services/token.service.js';


/**
 * Zoho Controller
 * Receives express requests, calls service layers, and returns responses.
 */

/**
 * Search Zoho Leads (Duplicate Detection)
 * GET /api/zoho/search?email=...&phone=...
 */
export const searchLead = async (req, res, next) => {
  try {
    logger.info('✓ Search Request Received');
    const { email, phone } = req.query;
    
    // Validate at least one parameter is present
    if (!email && !phone) {
      throw new ApiError(400, 'At least email or phone query parameter is required.');
    }

    if (email) logger.info('✓ Searching By Email');
    if (phone) logger.info('✓ Searching By Phone');

    const results = await zohoService.searchLead({ email, phone });

    if (results && results.length > 0) {
      const match = results[0];
      logger.info('✓ Duplicate Found');
      return res.status(200).json({
        duplicate: true,
        lead: {
          id: match.id,
          Last_Name: match.Last_Name || '',
          Company: match.Company || '',
          Email: match.Email || '',
          Phone: match.Phone || ''
        }
      });
    }

    logger.info('✓ No Duplicate Found');
    return res.status(200).json({
      duplicate: false,
      lead: null
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Create a Zoho Lead
 * POST /api/zoho/create-lead
 * Body: { Last_Name, Company, Email, Phone }
 */
export const createLead = async (req, res, next) => {
  try {
    logger.info('✓ Create Lead Request Received');
    const { Last_Name, Company, Email, Phone, Designation, Website, Street } = req.body;

    // Validate that Last_Name is present and non-empty
    if (!Last_Name || typeof Last_Name !== 'string' || Last_Name.trim().length === 0) {
      throw new ApiError(400, 'Last_Name is required and cannot be empty.');
    }

    const leadPayload = {
      Last_Name: Last_Name.trim(),
      Company: Company ? Company.trim() : 'Not Provided', // Zoho Leads usually require Company, default if absent
      Email: Email ? Email.trim() : undefined,
      Phone: Phone ? Phone.trim() : undefined,
      Designation: Designation ? Designation.trim() : undefined,
      Website: Website ? Website.trim() : undefined,
      Street: Street ? Street.trim() : undefined
    };

    logger.info(`[Debug] Zoho CRM payload: ${JSON.stringify(leadPayload, null, 2)}`);

    // Call service layer to perform Zoho Lead creation
    const result = await zohoService.createLead(leadPayload);

    const recordResult = result?.data?.[0];
    if (!recordResult || recordResult.status !== 'success') {
      const errMsg = recordResult?.message || 'Zoho CRM record creation failed.';
      logger.error(`Zoho CRM Lead creation failed: ${errMsg}`);
      throw new ApiError(400, `Zoho CRM Error: ${errMsg}`, recordResult);
    }

    const zohoLeadId = recordResult.details?.id;
    logger.info('✓ Zoho Lead Created Successfully');

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      zohoLeadId
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Test Zoho Access Token Service
 * GET /api/zoho/test-token
 */
export const testToken = async (req, res, next) => {
  try {
    logger.info('GET /api/zoho/test-token called');
    const token = await getAccessToken();
    
    // Check if token exists and is valid
    if (!token) {
      throw new ApiError(502, 'Zoho token service returned an empty token.');
    }

    res.status(200).json({
      success: true,
      message: 'Access token generated successfully'
    });
  } catch (error) {
    next(error);
  }
};

