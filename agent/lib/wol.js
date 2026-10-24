// Wake-on-LAN: liga a TV (ative na TV: Geral → Dispositivos → "Ligar via Wi-Fi/Mobile").
const dgram = require('dgram');
module.exports = function wake(mac, address = '255.255.255.255') {
  const hex = mac.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 12) return Promise.reject(new Error('MAC inválido'));
  const packet = Buffer.alloc(102, 0xff);
  for (let i = 6; i < 102; i += 6) Buffer.from(hex, 'hex').copy(packet, i);
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.once('listening', () => s.setBroadcast(true));
    s.send(packet, 0, packet.length, 9, address, (err) => { s.close(); err ? reject(err) : resolve(); });
  });
};
