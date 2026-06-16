import { whatsappService } from './services/whatsapp.service.js';
import { config } from './config/env.js';

async function testFixed() {
  console.log('Loaded Template Name:');
  console.log(config.WHATSAPP_TEMPLATE_NAME);
  console.log('Loaded Language Code:');
  console.log(config.WHATSAPP_TEMPLATE_LANGUAGE_CODE);

  const recipient = '15550100000';
  const name = 'Test User';
  const details = {
    name: 'Test User',
    email: 'test@example.com',
    company: 'Test Company'
  };

  try {
    const result = await whatsappService.sendWhatsAppTemplate(recipient, name, details);
    console.log('\n==================================================');
    console.log('FINAL VALIDATION RESULTS');
    console.log('==================================================');
    console.log('- Final JSON payload:');
    console.log(JSON.stringify(result.payload, null, 2));
    console.log('- HTTP status:');
    console.log(200); // Response received successfully
    console.log('- Meta response:');
    console.log(JSON.stringify(result.response, null, 2));
    console.log('- Message ID (if successful):');
    console.log(result.response?.messages?.[0]?.id || 'N/A');
  } catch (err) {
    console.log('\n==================================================');
    console.log('FINAL VALIDATION RESULTS (FAILED)');
    console.log('==================================================');
    if (err.payload) {
      console.log('- Final JSON payload:');
      console.log(JSON.stringify(err.payload, null, 2));
    }
    console.log('- HTTP status:');
    console.log(err.response?.status || 'Error');
    if (err.response) {
      console.log('- Meta response:');
      console.log(JSON.stringify(err.response, null, 2));
    }
    console.log('- Any error details (if failed):');
    console.log(err.message);
  }
}

testFixed();
