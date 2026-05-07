const fs = require('fs');
const path = require('path');

const scanResult = JSON.parse(fs.readFileSync('d:/AI/Kurabe/.understand-anything/intermediate/scan-result.json', 'utf8'));
const graph = JSON.parse(fs.readFileSync('d:/AI/Kurabe/.understand-anything/intermediate/assembled-graph.json', 'utf8'));
const ignoreRaw = fs.readFileSync('d:/AI/Kurabe/.understand-anything/.understandignore', 'utf8');

const nodes = graph.nodes;
const edges = graph.edges;
const fileList = scanResult.fileList;

console.log('--- Coverage Report ---');
console.log(`Scan result files: ${fileList.length}`);
console.log(`Graph nodes: ${nodes.length}`);

const missingNodes = fileList.filter(f => !nodes.some(n => n.id === f));
console.log(`Missing nodes from graph: ${missingNodes.length}`);
if (missingNodes.length > 0) console.log('Missing:', missingNodes);

console.log('\n--- Edge Resolution Report ---');
const nodeIds = new Set(nodes.map(n => n.id.replace(/\\/g, '/')));
const unresolved = edges.filter(e => {
    if (e.to.startsWith('@/')) {
        const resolvedPath = e.to.replace('@/', 'src/').replace(/\\/g, '/');
        // Simple check: does any node ID start with this resolved path (ignoring extension)?
        return !Array.from(nodeIds).some(id => id.startsWith(resolvedPath));
    }
    return false;
});

console.log(`Edges with unresolved aliases (@/): ${unresolved.length}`);
if (unresolved.length > 0) {
    console.log('Sample unresolved:', unresolved.slice(0, 5));
}

console.log('\n--- Ignore Compliance Report ---');
// Simulating the ignore patterns mentioned earlier
const ignorePatterns = ['.env*', '*.xlsx', '*.md', '!README.md']; 
const violations = fileList.filter(f => {
    if (f === 'README.md') return false;
    return f.endsWith('.xlsx') || f.startsWith('.env') || f.endsWith('.md');
});
console.log(`Ignore violations (files that should be ignored but are in scan): ${violations.length}`);
if (violations.length > 0) console.log('Violations:', violations);
