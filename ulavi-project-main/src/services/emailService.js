/**
 * EmailJS Email Service
 * Reusable service for sending emails via EmailJS.
 *
 * Required Vite environment variables:
 *   VITE_EMAILJS_SERVICE_ID
 *   VITE_EMAILJS_TEMPLATE_ID
 *   VITE_EMAILJS_PUBLIC_KEY
 */

import emailjs from '@emailjs/browser';

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

/**
 * Sends an email using EmailJS.
 *
 * @param {Object} contact  - Contact object with at least { name, email }.
 * @param {string} message  - The message body to include in the email.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const sendEmail = async (contact, message) => {
  console.log('✓ Email Send Started');

  // 1. Verify and log EmailJS Configuration (without exposing secret values)
  console.log('--- EmailJS Configuration Verification ---');
  console.log(`- Service ID Loaded: ${SERVICE_ID ? 'YES (Length: ' + SERVICE_ID.length + ')' : 'NO'}`);
  console.log(`- Template ID Loaded: ${TEMPLATE_ID ? 'YES (Length: ' + TEMPLATE_ID.length + ')' : 'NO'}`);
  console.log(`- Public Key Loaded: ${PUBLIC_KEY ? 'YES (Length: ' + PUBLIC_KEY.length + ')' : 'NO'}`);

  // ── Validate recipient email ──
  if (!contact?.email || typeof contact.email !== 'string' || contact.email.trim().length === 0) {
    const error = 'Cannot send email: recipient email is missing.';
    console.error('✓ Email Send Failed:', error);
    return { success: false, error };
  }

  // ── Validate EmailJS configuration ──
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    const error = 'EmailJS is not configured. Check VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY.';
    console.error('✓ Email Send Failed:', error);
    return { success: false, error };
  }

  const templateParams = {
    name:    contact.name    ? contact.name.trim()    : 'Unknown',
    email:   contact.email.trim(),
    company: contact.company ? contact.company.trim() : 'Not Available',
    message: message || '',
  };

  // 2. Log frontend request parameters
  console.log('--- EmailJS Frontend Request parameters ---');
  console.log(`- Recipient Email (destination): ${contact.email.trim()}`);
  console.log(`- Recipient Name: ${templateParams.name}`);
  console.log(`- Company: ${templateParams.company}`);
  console.log(`- Message Body: ${templateParams.message}`);
  console.log('- Template Parameters:', JSON.stringify(templateParams, null, 2));

  try {
    const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    
    // 3. Log EmailJS Success Response
    console.log('--- EmailJS Success Response ---');
    console.log(`- HTTP Status: ${response.status}`);
    console.log(`- Success Text: ${response.text}`);
    console.log('✓ Email Sent Successfully');
    
    return { success: true, response };
  } catch (err) {
    // 3. Log EmailJS Error Response
    console.error('--- EmailJS Error Response ---');
    console.error(`- HTTP Status / Error Code: ${err?.status || 'N/A'}`);
    console.error(`- Error Text: ${err?.text || 'N/A'}`);
    console.error(`- Error Message: ${err?.message || 'N/A'}`);
    
    const error = err?.text || err?.message || 'Unknown EmailJS error';
    console.error('✓ Email Send Failed:', error);
    
    return { success: false, error, status: err?.status, text: err?.text };
  }
};
