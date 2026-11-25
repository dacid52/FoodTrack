const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const toDataUri = (file, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;

const fontFaces = [
  ['400', 'node_modules/@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf'],
  ['500', 'node_modules/@expo-google-fonts/be-vietnam-pro/500Medium/BeVietnamPro_500Medium.ttf'],
  ['600', 'node_modules/@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf'],
  ['700', 'node_modules/@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf'],
  ['800', 'node_modules/@expo-google-fonts/be-vietnam-pro/800ExtraBold/BeVietnamPro_800ExtraBold.ttf'],
  ['900', 'node_modules/@expo-google-fonts/be-vietnam-pro/900Black/BeVietnamPro_900Black.ttf'],
].map(([weight, file]) =>
  `@font-face{font-family:"Be Vietnam Pro";font-style:normal;font-weight:${weight};src:url("${toDataUri(file, 'font/ttf')}") format("truetype");font-display:swap;}`,
).join('');

const titanOneFace = `@font-face{font-family:"Titan One";font-style:normal;font-weight:400;src:url("${toDataUri('node_modules/@expo-google-fonts/titan-one/400Regular/TitanOne_400Regular.ttf', 'font/ttf')}") format("truetype");font-display:swap;}`;

const symbols = toDataUri(
  'node_modules/@fontsource-variable/material-symbols-outlined/files/material-symbols-outlined-latin-full-normal.woff2',
  'font/woff2',
);
const symbolsFace = `@font-face{font-family:"Material Symbols Outlined";font-style:normal;font-weight:100 700;src:url("${symbols}") format("woff2");font-display:block;}.material-symbols-outlined{font-family:"Material Symbols Outlined";font-weight:normal;font-style:normal;font-size:1em;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;word-wrap:normal;direction:ltr;font-feature-settings:"liga";-webkit-font-feature-settings:"liga";-webkit-font-smoothing:antialiased;}`;

// Concat JS modules in correct order
const jsModules = [
  'webview/modules/state.js',
  'webview/modules/dashboard.js',
  'webview/modules/sales.js',
  'webview/modules/menu.js',
  'webview/modules/expenses.js',
  'webview/modules/stats.js',
  'webview/modules/history.js',
  'webview/modules/main.js',
].map(file => read(file)).join('\n');

// Read templates in correct order
const templatesDir = path.join(root, 'webview', 'templates');
const templateFiles = [
  'base.html',
  'header.html',
  'dashboard.html',
  'sales.html',
  'menu.html',
  'stats.html',
  'history.html',
  'footer.html',
  'modals.html',
  'toast.html',
];

let html = templateFiles.map(file => {
  const filePath = path.join(templatesDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Template file not found: ${file}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}).join('\n');

// Add main wrapper for views
html = html.replace(
  '    <!-- ================= VIEW 1: TỔNG QUAN',
  '  <!-- MAIN SCROLLABLE VIEW CONTAINER -->\n  <main class="flex-1 overflow-y-auto hide-scrollbar relative">\n\n    <!-- ================= VIEW 1: TỔNG QUAN'
);

// Close main tag after last view section, before footer
html = html.replace(
  '</section>\n<!-- FIXED BOTTOM TAB NAVIGATION',
  '</section>\n  </main>\n\n<!-- FIXED BOTTOM TAB NAVIGATION'
);

// Inject CSS
const css = `${fontFaces}${titanOneFace}${symbolsFace}${read('webview/generated.css')}`;
const customCss = read('webview/css/custom.css');
html = html.replace('<!-- FONT_FACES_CSS -->', `<style>${css}</style>`);
html = html.replace('<!-- CUSTOM_CSS -->', `<style>${customCss}</style>`);

// Inject JS - append script tag and closing body/html after all templates
html += '\n<script>(function () {\n' + jsModules + '\n})();</script>\n</body>\n</html>';

// Write output
const output = path.join(root, 'assets', 'foodtrack', 'index.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);

console.log(`Built offline WebView UI from templates: ${path.relative(root, output)}`);
console.log(`  - Templates: ${templateFiles.length} files`);
console.log(`  - JS modules: 8 files`);
console.log(`  - CSS: font-faces + generated + custom`);
process.exit(0);
