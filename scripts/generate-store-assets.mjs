import { mkdir, writeFile } from 'node:fs/promises';
const { default: sharp } = await import(process.env.SHARP_MODULE || 'sharp');
const icons = new URL('../extension/icons/', import.meta.url);
const assets = new URL('../store/assets/', import.meta.url);
await mkdir(icons, { recursive: true });
await mkdir(assets, { recursive: true });
// Vector version of the extension's existing green S-arrow brand.
const symbol = `<rect x="12" y="12" width="104" height="104" rx="29" fill="#254d3e"/><path d="M79 38C62 29 43 37 43 51C43 65 78 58 78 74C78 90 55 95 39 84" fill="none" stroke="#d9f4b7" stroke-width="10" stroke-linecap="round"/><path d="M88 27h16v16M87 44l17-17" fill="none" stroke="#d9f4b7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${symbol}</svg>`;
await writeFile(new URL('icon.svg', icons), icon);
for (const size of [16, 32, 48, 128]) await sharp(Buffer.from(icon)).resize(size, size).png().toFile(new URL(`icon-${size}.png`, icons).pathname);
await sharp(Buffer.from(icon)).png().toFile(new URL('store-icon-128.png', assets).pathname);
const promo = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280"><rect width="440" height="280" fill="#193b31"/><circle cx="413" cy="13" r="130" fill="#224b3c"/><circle cx="-30" cy="282" r="120" fill="#224b3c"/><g transform="translate(38 66) scale(1.18)">${symbol}</g><g transform="translate(215 66) rotate(6 85 75)"><rect x="-8" y="-8" width="174" height="151" rx="18" fill="#90b89a"/><rect width="174" height="151" rx="18" fill="#f7f8f2"/><rect x="22" y="25" width="76" height="12" rx="6" fill="#254d3e"/><rect x="22" y="52" width="130" height="8" rx="4" fill="#bdcfb3"/><rect x="22" y="72" width="98" height="8" rx="4" fill="#bdcfb3"/><path d="M26 108l8 8 15-17" fill="none" stroke="#477555" stroke-width="5" stroke-linecap="round"/><rect x="65" y="103" width="80" height="11" rx="5" fill="#dbecc9"/></g></svg>`;
await writeFile(new URL('promo-small.svg', assets), promo);
await sharp(Buffer.from(promo)).removeAlpha().png().toFile(new URL('promo-small-440x280.png', assets).pathname);
console.log('Created 4 extension icons, a store icon and 440x280 promotional image.');
