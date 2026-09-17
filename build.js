const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const indexPath = path.join(rootDir, 'index.html');
const cssPath = path.join(rootDir, 'css', 'styles.css');
const outputFile = path.join(distDir, 'rf-block-diagram-standalone.html');

console.log('📦 Packaging RF Block Diagram into a single standalone HTML file...');

// 1. Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 2. Read HTML template
let htmlContent = fs.readFileSync(indexPath, 'utf8');

// 3. Inline CSS
if (fs.existsSync(cssPath)) {
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  htmlContent = htmlContent.replace(
    '<link rel="stylesheet" href="css/styles.css"/>',
    `<style>\n${cssContent}\n</style>`
  );
}

// 4. Collect and inline JS files in dependency order
const scriptMatches = [...htmlContent.matchAll(/<script src="([^"]+)"><\/script>/g)];

let combinedJs = '';
scriptMatches.forEach(match => {
  const relPath = match[1];
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const jsContent = fs.readFileSync(fullPath, 'utf8');
    combinedJs += `/* --- File: ${relPath} --- */\n${jsContent}\n\n`;
  } else {
    console.warn(`⚠️ Warning: Script file not found: ${relPath}`);
  }
});

// Replace all script tags with a single inlined <script> block
const firstScriptPos = htmlContent.indexOf('<!-- JavaScript Core Modules -->');
if (firstScriptPos !== -1) {
  htmlContent = htmlContent.slice(0, firstScriptPos) +
    `<script>\n${combinedJs}</script>\n</body>\n</html>`;
} else {
  // Fallback string replacement
  htmlContent = htmlContent.replace(/<script src="[^"]+"><\/script>\s*/g, '');
  htmlContent = htmlContent.replace('</body>', `<script>\n${combinedJs}</script>\n</body>`);
}

// 5. Write single standalone HTML file
fs.writeFileSync(outputFile, htmlContent, 'utf8');

const stats = fs.statSync(outputFile);
const sizeKb = (stats.size / 1024).toFixed(2);

console.log(`✅ Success! Created single distributable file:`);
console.log(`   📄 ${outputFile} (${sizeKb} KB)`);

