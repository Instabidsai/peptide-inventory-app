/**
 * Version Bump Script
 * ===================
 * Bumps the version in package.json and index.html simultaneously.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch   # 1.0.0 → 1.0.1
 *   node scripts/bump-version.mjs minor   # 1.0.0 → 1.1.0
 *   node scripts/bump-version.mjs major   # 1.0.0 → 2.0.0
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const bump = process.argv[2] || 'patch';
if (!['major', 'minor', 'patch'].includes(bump)) {
    console.error('Usage: node scripts/bump-version.mjs [major|minor|patch]');
    process.exit(1);
}

// Read current version from package.json
const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

const newVersion = bump === 'major' ? `${major + 1}.0.0`
    : bump === 'minor' ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;

// Update package.json
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Update index.html
const htmlPath = resolve(root, 'index.html');
let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(
    /(<meta name="app-version" content=")[^"]*(")/,
    `$1${newVersion}$2`
);
writeFileSync(htmlPath, html);

console.log(`Version bumped to ${newVersion}`);
