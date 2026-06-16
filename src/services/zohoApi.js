/**
 * Zoho CRM API Service
 * Maps contact fields and integrates with the backend Zoho API.
 */

import API_BASE_URL from '../config/api';

/**
 * Maps OCR contact fields to Zoho Lead format.
 * @param {Object} contact 
 * @returns {Object} Zoho Lead fields
 */
export const mapContactToZoho = (contact) => {
  return {
    Last_Name: contact.name ? contact.name.trim() : 'Unknown',
    Company: contact.company ? contact.company.trim() : 'Not Provided',
    Email: contact.email ? contact.email.trim() : undefined,
    Phone: contact.phone ? contact.phone.trim() : undefined,
    Designation: contact.title ? contact.title.trim() : undefined,
    Website: contact.website ? contact.website.trim() : undefined,
    Street: contact.address ? contact.address.trim() : undefined,
  };
};

/**
 * Creates a Lead in Zoho CRM via backend API.
 * @param {Object} contact 
 * @returns {Promise<Object>} Backend API response
 */
export const createZohoLead = async (contact) => {
  console.log('✓ Zoho Sync Started', contact);
  const payload = mapContactToZoho(contact);
  console.log('[Debug] Zoho CRM payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/zoho/create-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const errorMsg = data.message || `HTTP error ${response.status}`;
      console.error('✓ Zoho Sync Failed:', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('✓ Zoho Sync Success', data);
    return data; // { success: true, message, zohoLeadId }
  } catch (error) {
    console.error('✓ Zoho Sync Failed:', error.message);
    throw error;
  }
};
