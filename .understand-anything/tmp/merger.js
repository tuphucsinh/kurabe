const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const intermediateDir = path.join(rootDir, '.understand-anything', 'intermediate');
const outputGraph = { nodes: [], edges: [] };

const files = fs.readdirSync(intermediateDir).filter(f => f.startsWith('batch-') && f.endsWith('.json'));

for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(intermediateDir, file), 'utf8'));
    outputGraph.nodes.push(...data.nodes);
    outputGraph.edges.push(...data.edges);
}

// Clean duplicate edges if any (basic logic)
const edgeSet = new Set();
outputGraph.edges = outputGraph.edges.filter(e => {
    const key = `${e.from}->${e.to}->${e.type}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
});

fs.writeFileSync(path.join(intermediateDir, 'assembled-graph.json'), JSON.stringify(outputGraph, null, 2));
console.log(`Merged ${files.length} batches into assembled-graph.json. Total Nodes: ${outputGraph.nodes.length}, Total Edges: ${outputGraph.edges.length}`);
