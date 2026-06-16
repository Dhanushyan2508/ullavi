import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, './.env') });

async function queryTemplates() {
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';

  try {
    const res = await axios.get(`https://graph.facebook.com/${apiVersion}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    });
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err) {
    console.error(err.message);
  }
}

queryTemplates();
