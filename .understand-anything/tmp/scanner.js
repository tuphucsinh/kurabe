const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const ignoreFile = path.join(rootDir, '.understand-anything', '.understandignore');
const intermediateDir = path.join(rootDir, '.understand-anything', 'intermediate');

// Simple glob to regex for common patterns
function patternToRegex(pattern) {
    let p = pattern.trim();
    if (!p || p.startsWith('#')) return null;
    
    let isNegation = p.startsWith('!');
    if (isNegation) p = p.substring(1);
    
    let regexStr = p
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '(.+)')
        .replace(/\*/g, '[^/]+')
        .replace(/\//g, '[\\\\/]');
    
    if (p.endsWith('/')) {
        regexStr += '.*';
    } else {
        regexStr += '([\\\\/].*)?$';
    }
    
    return { regex: new RegExp('^' + regexStr), isNegation };
}

const ignoreContent = fs.readFileSync(ignoreFile, 'utf8');
const patterns = ignoreContent.split('\n')
    .map(patternToRegex)
    .filter(p => p !== null);

function isIgnored(relPath) {
    let ignored = false;
    // Normalize path to use forward slashes for matching
    const normalizedPath = relPath.replace(/\\/g, '/');
    
    for (const { regex, isNegation } of patterns) {
        if (regex.test(normalizedPath)) {
            ignored = !isNegation;
        }
    }
    return ignored;
}

const fileList = [];
const languages = {};

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const relPath = path.relative(rootDir, fullPath);
        
        if (isIgnored(relPath)) continue;
        
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else {
            fileList.push(relPath);
            const ext = path.extname(file).toLowerCase();
            languages[ext] = (languages[ext] || 0) + 1;
        }
    }
}

walk(rootDir);

const result = {
    fileList,
    languages,
    frameworks: ["Next.js", "React", "Supabase", "TailwindCSS"],
    timestamp: new Date().toISOString()
};

fs.writeFileSync(path.join(intermediateDir, 'scan-result.json'), JSON.stringify(result, null, 2));
console.log(`Scanned ${fileList.length} files.`);
