
import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/pages/ContactDetails.tsx');
const content = fs.readFileSync(filePath, 'utf-8');

// Find the last closing brace of the default function
const lastBraceIndex = content.lastIndexOf('}');
if (lastBraceIndex === -1) {
    console.error('Could not find closing brace');
    process.exit(1);
}

// We want to keep the brace, but remove everything after it (including newlines/garbage)
// The file should end with "}" and a newline.
const cleanContent = content.substring(0, lastBraceIndex + 1) + '\n';

fs.writeFileSync(filePath, cleanContent, 'utf-8');
console.log('Successfully cleaned contact details file.');
