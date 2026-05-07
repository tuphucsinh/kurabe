const fs = require('fs');
const graphPath = 'd:/AI/Kurabe/.understand-anything/intermediate/assembled-graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

const newNode = {
  "id": "src\\providers\\query-provider.tsx",
  "type": "file",
  "ext": ".tsx",
  "size": 485,
  "exports": ["default"],
  "imports": ["@tanstack/react-query", "react"]
};

const newEdges = [
  {"from": "src\\providers\\query-provider.tsx", "to": "@tanstack/react-query", "type": "import"},
  {"from": "src\\providers\\query-provider.tsx", "to": "react", "type": "import"}
];

graph.nodes.push(newNode);
graph.edges.push(...newEdges);

fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
console.log('Successfully patched assembled-graph.json with missing node and edges.');
