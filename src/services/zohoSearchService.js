/**
 * Zoho CRM Search Service
 * Integrates with the backend Zoho search API for duplicate detection.
 */

import API_BASE_URL from '../config/api';

/**
 * Searches for duplicate leads in Zoho CRM using email and phone.
 * @param {Object} contact 
 * @returns {Promise<Object>} Object indicating if duplicate exists and the matching lead data
 */
export const searchZohoDuplicate = async (contact) => {
  console.log('✓ Duplicate Check Started');
  
  const email = contact.email ? contact.email.trim() : '';
  const phone = contact.phone ? contact.phone.trim() : '';
  
  if (!email && !phone) {
    console.log('✓ No Duplicate Found (missing email and phone)');
    return { duplicate: false, lead: null };
  }
  
  const queryParams = new URLSearchParams();
  if (email) {
    queryParams.append('email', email);
  }
  if (phone) {
    queryParams.append('phone', phone);
  }
  
  console.log('✓ Searching Zoho CRM');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/zoho/search?${queryParams.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.duplicate) {
      console.log('✓ Duplicate Found', data.lead);
    } else {
      console.log('✓ No Duplicate Found');
    }
    
    return data; // { duplicate: boolean, lead: Object | null }
  } catch (error) {
    console.error('✓ Zoho CRM search failed:', error.message);
    throw error;
  }
};
