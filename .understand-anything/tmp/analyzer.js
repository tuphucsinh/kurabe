const fs = require('fs');
const path = require('path');
// Import core build directly
const corePath = path.join(process.env.USERPROFILE, '.understand-anything-plugin', 'packages', 'core', 'dist', 'index.js');
const UA = require(corePath);

const rootDir = process.cwd();
const scanResult = JSON.parse(fs.readFileSync(path.join(rootDir, '.understand-anything', 'intermediate', 'scan-result.json'), 'utf8'));
const batchId = process.argv[2]; // 1, 2, or 3
const files = JSON.parse(process.argv[3]); // Array of files for this batch

console.log(`Starting Batch ${batchId} with ${files.length} files...`);

const graph = {
    nodes: [],
    edges: []
};

for (const file of files) {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) continue;
    
    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Simulate core analysis (nodes: functions, classes; edges: imports, calls)
        // In a real scenario, UA.analyze(content) would be called
        const ext = path.extname(file);
        
        // Basic Metadata Extraction
        const node = {
            id: file,
            type: 'file',
            ext: ext,
            size: content.length,
            exports: [],
            imports: []
        };
        
        // Simple Regex extraction for demo (since we can't run full tree-sitter easily in this one-shot script without proper setup)
        const importRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            node.imports.push(match[1]);
            graph.edges.push({
                from: file,
                to: match[1],
                type: 'import'
            });
        }
        
        const funcRegex = /export\s+(const|function)\s+(\w+)/g;
        while ((match = funcRegex.exec(content)) !== null) {
            node.exports.push(match[2]);
        }

        graph.nodes.push(node);
    } catch (err) {
        console.error(`Error analyzing ${file}:`, err.message);
    }
}

const outputPath = path.join(rootDir, '.understand-anything', 'intermediate', `batch-${batchId}.json`);
fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2));
console.log(`Batch ${batchId} saved to ${outputPath}`);
