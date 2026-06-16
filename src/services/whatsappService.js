import API_BASE_URL from '../config/api';

/**
 * Meta WhatsApp Cloud API Service
 * Handles POST requests to our Node.js backend.
 */

/**
 * Sends a WhatsApp message using the approved template.
 * 
 * @param {Object} contact - Contact details containing at least { phone }
 * @returns {Promise<{ success: boolean, data?: Object, error?: string }>} Response status
 */
export const sendWhatsAppMessage = async (contact) => {
  console.log('✓ WhatsApp Send Started', contact);

  const rawPhone = contact?.phone || '';
  const normalizedPhone = rawPhone.trim().replace(/[^0-9]/g, '');

  if (!normalizedPhone) {
    const error = 'Cannot send WhatsApp: phone number is missing or invalid.';
    console.error('✓ WhatsApp Send Failed:', error);
    return { success: false, error };
  }

  const resolveContactName = (raw) => {
    if (!raw || typeof raw !== 'string') return 'Valued Customer';
    const t = raw.trim();
    const l = t.toLowerCase();
    if (
      t === '' || t === '—' || t === 'N/A' ||
      l === 'not provided' || l === 'not available' ||
      l === 'unknown' || l === 'unknown name' || l === 'unknown company'
    ) {
      return 'Valued Customer';
    }
    return t;
  };

  const contactName = resolveContactName(contact.name);

  try {
    const response = await fetch(`${API_BASE_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        phone: normalizedPhone,
        name: contactName
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const errorMsg = data.message || `HTTP error ${response.status}`;
      console.error('✓ WhatsApp Send Failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log('✓ WhatsApp Send Success', data);
    return { success: true, data };
  } catch (error) {
    console.error('✓ WhatsApp Send Failed:', error.message);
    return { success: false, error: error.message };
  }
};

