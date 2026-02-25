import axios from 'axios';
import crypto from 'crypto';

const XUI_URL = process.env.XUI_URL || 'http://108.165.174.229:80';
const XUI_USER = process.env.XUI_USER || 'admin';
const XUI_PASS = process.env.XUI_PASS || 'admin';
const XUI_INBOUND_ID = parseInt(process.env.XUI_INBOUND_ID || '1');
const PUBLIC_IP = '108.165.174.229';

let cookie = '';

async function login() {
  try {
    console.log(`Attempting login to 3X-UI at ${XUI_URL}...`);
    const response = await axios.post(`${XUI_URL}/login`, {
      username: XUI_USER,
      password: XUI_PASS
    }, { timeout: 5000 });
    
    if (response.data && response.data.success) {
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        cookie = setCookie[0].split(';')[0];
        console.log('3X-UI Login successful, cookie obtained.');
        return true;
      }
    }
    console.error('3X-UI Login failed: Invalid credentials or response structure', response.data);
    return false;
  } catch (error: any) {
    console.error('3X-UI Login failed:', error.message);
    return false;
  }
}

export async function createVpnClient(userId: number, email: string, expiryTime: number) {
  if (!cookie) {
    const loggedIn = await login();
    if (!loggedIn) throw new Error('Could not login to VPN Panel. Check credentials and URL.');
  }

  try {
    const uuid = crypto.randomUUID();
    const clientEmail = `${email}_${userId}`;
    
    console.log(`Creating client ${clientEmail} for inbound ${XUI_INBOUND_ID}...`);
    
    const clientData = {
      id: XUI_INBOUND_ID,
      settings: JSON.stringify({
        clients: [{
          id: uuid,
          flow: "xtls-rprx-vision",
          email: clientEmail,
          limitIp: 0,
          totalGB: 0,
          expiryTime: expiryTime,
          enable: true,
          tgId: userId.toString(),
          subId: ""
        }]
      })
    };

    const addResponse = await axios.post(`${XUI_URL}/panel/api/inbounds/addClient`, clientData, {
      headers: { Cookie: cookie },
      timeout: 5000
    });

    if (!addResponse.data || !addResponse.data.success) {
      throw new Error(`Failed to add client to panel: ${addResponse.data?.msg || 'Unknown error'}`);
    }

    // Get inbound details to construct the config
    const inboundsResponse = await axios.get(`${XUI_URL}/panel/api/inbounds/get/${XUI_INBOUND_ID}`, {
      headers: { Cookie: cookie }
    });

    const inbound = inboundsResponse.data.obj;
    if (!inbound) throw new Error(`Inbound with ID ${XUI_INBOUND_ID} not found in panel.`);

    const streamSettings = JSON.parse(inbound.streamSettings);
    const remark = `DzenVPN_${userId}`;
    const port = inbound.port;
    
    let config = '';
    
    // Check if Reality is enabled
    if (streamSettings.security === 'reality') {
      const sni = streamSettings.realitySettings.serverNames[0];
      const pbk = streamSettings.realitySettings.publicKey;
      const sid = streamSettings.realitySettings.shortIds[0];
      const flow = "xtls-rprx-vision";
      config = `vless://${uuid}@${PUBLIC_IP}:${port}?type=tcp&security=reality&sni=${sni}&fp=chrome&pbk=${pbk}&sid=${sid}&flow=${flow}#${remark}`;
    } else {
      // Fallback to simple VLESS
      config = `vless://${uuid}@${PUBLIC_IP}:${port}?type=${streamSettings.network || 'tcp'}&security=${streamSettings.security || 'none'}#${remark}`;
    }

    console.log(`VPN Config generated successfully for user ${userId}`);
    return {
      email: clientEmail,
      config: config
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('Cookie expired, retrying login...');
      cookie = ''; 
      return createVpnClient(userId, email, expiryTime);
    }
    console.error('Failed to create VPN client:', error.message);
    throw error;
  }
}
