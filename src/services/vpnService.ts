import axios from 'axios';

const XUI_URL = process.env.XUI_URL || 'http://108.165.174.229:2053';
const XUI_USER = process.env.XUI_USER || 'admin';
const XUI_PASS = process.env.XUI_PASS || 'admin';
const XUI_INBOUND_ID = parseInt(process.env.XUI_INBOUND_ID || '1');

let cookie = '';

async function login() {
  try {
    const response = await axios.post(`${XUI_URL}/login`, {
      username: XUI_USER,
      password: XUI_PASS
    });
    
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      cookie = setCookie[0].split(';')[0];
    }
    return true;
  } catch (error) {
    console.error('3X-UI Login failed:', error);
    return false;
  }
}

export async function createVpnClient(userId: number, email: string, expiryTime: number) {
  if (!cookie) {
    await login();
  }

  try {
    const uuid = crypto.randomUUID();
    const clientEmail = `${email}_${userId}`;
    
    const clientData = {
      id: XUI_INBOUND_ID,
      settings: JSON.stringify({
        clients: [{
          id: uuid,
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

    await axios.post(`${XUI_URL}/panel/api/inbounds/addClient`, clientData, {
      headers: { Cookie: cookie }
    });

    // Get inbound details to construct the config
    const inboundsResponse = await axios.get(`${XUI_URL}/panel/api/inbounds/get/${XUI_INBOUND_ID}`, {
      headers: { Cookie: cookie }
    });

    const inbound = inboundsResponse.data.obj;
    const streamSettings = JSON.parse(inbound.streamSettings);
    
    // Construct VLESS Reality link (assuming Reality is used as discussed)
    const remark = `DzenVPN_${userId}`;
    const host = streamSettings.realitySettings.dest.split(':')[0];
    const sni = streamSettings.realitySettings.serverNames[0];
    const pbk = streamSettings.realitySettings.publicKey;
    const sid = streamSettings.realitySettings.shortIds[0];
    const flow = "xtls-rprx-vision";
    
    const serverIp = XUI_URL.split('://')[1].split(':')[0];
    const port = inbound.port;

    const config = `vless://${uuid}@${serverIp}:${port}?type=tcp&security=reality&sni=${sni}&fp=chrome&pbk=${pbk}&sid=${sid}&flow=${flow}#${remark}`;

    return {
      email: clientEmail,
      config: config
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      cookie = ''; // Reset cookie and retry once
      return createVpnClient(userId, email, expiryTime);
    }
    console.error('Failed to create VPN client:', error);
    throw error;
  }
}
