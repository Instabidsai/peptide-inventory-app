
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', 'src');

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            replaceInDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('@/integrations/supabase')) {
                console.log(`Updating ${fullPath}`);
                content = content.replace(/@\/integrations\/supabase/g, '@/integrations/sb_client');
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

replaceInDir(rootDir);
console.log("Refactor complete.");
