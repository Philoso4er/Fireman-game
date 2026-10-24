// Generates PWA icons from an inline SVG emblem (tower + flame). Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
const emblem = (pad) => {
  const s = 512, k = (512 - 2*pad)/512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
<defs><radialGradient id="g" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#7c2d12"/><stop offset="1" stop-color="#111827"/></radialGradient>
<linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#dc2626"/><stop offset=".55" stop-color="#f97316"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g transform="translate(${pad} ${pad}) scale(${k})">
<rect x="156" y="150" width="200" height="320" fill="#374151" stroke="#0b0f19" stroke-width="10"/>
${[0,1,2,3].map(r=>[0,1,2].map(c=>`<rect x="${178+c*58}" y="${180+r*68}" width="40" height="44" fill="${(r+c)%2? '#fbbf24':'#1f2937'}"/>`).join('')).join('')}
<rect x="230" y="410" width="52" height="60" fill="#0b0f19"/>
<path d="M256 40 C300 110 360 130 340 220 C330 270 290 300 256 300 C222 300 182 270 172 220 C160 160 210 150 220 100 C240 130 236 160 256 170 C270 130 250 90 256 40Z" fill="url(#f)" stroke="#0b0f19" stroke-width="8"/>
<path d="M256 170 C280 200 300 220 290 255 C284 278 270 288 256 288 C242 288 228 278 222 255 C216 230 240 215 256 170Z" fill="#fde68a"/>
</g></svg>`;
};
const out = 'public/icons/';
await sharp(Buffer.from(emblem(0))).resize(192).png().toFile(out+'icon-192.png');
await sharp(Buffer.from(emblem(0))).resize(512).png().toFile(out+'icon-512.png');
await sharp(Buffer.from(emblem(70))).resize(512).png().toFile(out+'icon-512-maskable.png');
await sharp(Buffer.from(emblem(0))).resize(180).png().toFile(out+'apple-touch-icon.png');
await sharp(Buffer.from(emblem(0))).resize(32).png().toFile('public/favicon.png');
