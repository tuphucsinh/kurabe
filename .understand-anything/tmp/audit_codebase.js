const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('d:/AI/Kurabe/.understand-anything/intermediate/assembled-graph.json', 'utf8'));

const nodes = graph.nodes;
const edges = graph.edges;

console.log('--- Codebase Audit ---');

// 1. Unused Exports (Partial check: exported but never imported via alias or relative path)
const allImports = new Set(edges.filter(e => e.type === 'import').map(e => e.to));
const unusedPotential = nodes.filter(n => n.exports.length > 0 && !allImports.has(n.id) && !allImports.has('@/' + n.id.replace('src\\', '').replace(/\\/g, '/').replace('.tsx', '').replace('.ts', '')));

console.log(`Potential unused file exports: ${unusedPotential.length}`);
// Note: This is an approximation since many imports are dynamic or use library aliases.

// 2. Circular Dependencies (Simple 2-level check)
const adjacency = {};
edges.forEach(e => {
    if (!adjacency[e.from]) adjacency[e.from] = new Set();
    adjacency[e.from].add(e.to);
});

const circular = [];
for (const from in adjacency) {
    for (const to of adjacency[from]) {
        if (adjacency[to] && adjacency[to].has(from)) {
            circular.push(`${from} <-> ${to}`);
        }
    }
}
console.log(`Circular dependencies (direct): ${circular.length / 2}`);
if (circular.length > 0) console.log('Samples:', circular.slice(0, 4));

// 3. Search for TODOs/FIXMEs
// I'll use a command for this later.

const auditReport = {
    unusedExports: unusedPotential.map(n => n.id),
    circularDeps: circular,
    timestamp: new Date().toISOString()
};

fs.writeFileSync('d:/AI/Kurabe/.understand-anything/intermediate/audit-results.json', JSON.stringify(auditReport, null, 2));
console.log('Successfully generated audit-results.json');
