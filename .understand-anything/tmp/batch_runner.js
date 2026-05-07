const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = process.cwd();
const scanResult = JSON.parse(fs.readFileSync(path.join(rootDir, '.understand-anything', 'intermediate', 'scan-result.json'), 'utf8'));
const fileList = scanResult.fileList;

// Batching logic
const batch1 = fileList.filter(f => f.match(/src[\\\/](lib|types|hooks|contexts|data|actions)/i) || !f.includes('src'));
const batch2 = fileList.filter(f => f.match(/src[\\\/]components/i));
const batch3 = fileList.filter(f => f.match(/src[\\\/]app/i));

const batches = [batch1, batch2, batch3];

for (let i = 0; i < batches.length; i++) {
    const id = i + 1;
    const files = batches[i];
    if (files.length === 0) continue;
    
    console.log(`Running Batch ${id} (${files.length} files)...`);
    const filesJson = JSON.stringify(files);
    
    // We need to escape double quotes for the command line argument
    const escapedFilesJson = filesJson.replace(/"/g, '\\"');
    
    try {
        const output = execSync(`node .understand-anything/tmp/analyzer.js ${id} "${escapedFilesJson}"`, { encoding: 'utf8' });
        console.log(output);
    } catch (err) {
        console.error(`Error in Batch ${id}:`, err.stdout || err.message);
    }
}

console.log("All batches finished.");
