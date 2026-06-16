import axios from 'axios';

const BACKEND = 'https://business-card-backend-jvf4.onrender.com';

async function audit() {
  // 1. Query test-token to see what the deployed backend has loaded
  console.log('=== 1. DEPLOYED BACKEND: test-token ===');
  try {
    const tokenRes = await axios.get(`${BACKEND}/api/whatsapp/test-token`);
    console.log(JSON.stringify(tokenRes.data, null, 2));
  } catch (err) {
    console.log('test-token error:', err.response?.data || err.message);
  }

  // 2. Query health endpoint for any config exposure
  console.log('\n=== 2. DEPLOYED BACKEND: health ===');
  try {
    const healthRes = await axios.get(`${BACKEND}/api/health`);
    console.log(JSON.stringify(healthRes.data, null, 2));
  } catch (err) {
    console.log('health error:', err.response?.data || err.message);
  }

  // 3. Call POST /api/whatsapp/send with a real recipient to capture the full error chain
  console.log('\n=== 3. DEPLOYED BACKEND: POST /api/whatsapp/send ===');
  try {
    const sendRes = await axios.post(`${BACKEND}/api/whatsapp/send`, {
      phone: '919791132297',
      name: 'Audit Test',
      email: 'audit@test.com',
      company: 'AuditCorp'
    });
    console.log('HTTP Status:', sendRes.status);
    console.log('Response:', JSON.stringify(sendRes.data, null, 2));
  } catch (err) {
    console.log('HTTP Status:', err.response?.status || 'N/A');
    console.log('Response:', JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // 4. Call POST /api/whatsapp/test-template (if route exists on deployed)
  console.log('\n=== 4. DEPLOYED BACKEND: POST /api/whatsapp/test-template ===');
  try {
    const testRes = await axios.post(`${BACKEND}/api/whatsapp/test-template`, {
      phone: '919791132297',
      name: 'Audit Test',
      email: 'audit@test.com',
      company: 'AuditCorp'
    });
    console.log('HTTP Status:', testRes.status);
    console.log('Response:', JSON.stringify(testRes.data, null, 2));
  } catch (err) {
    console.log('HTTP Status:', err.response?.status || 'N/A');
    console.log('Response:', JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

audit();
