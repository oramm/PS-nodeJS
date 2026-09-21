import tls from 'node:tls';
const s = tls.connect({ host: 's22.kylos.pl', port: 993, servername: 's22.kylos.pl' }, () => {
  console.log('CONNECTED, authorized=', s.authorized);
});
s.setTimeout(12000, () => { console.log('TIMEOUT'); s.destroy(); process.exit(2); });
s.on('data', d => { console.log('BANNER:', d.toString().slice(0,120)); s.destroy(); process.exit(0); });
s.on('error', e => { console.log('ERROR:', e.code || e.message); process.exit(1); });
