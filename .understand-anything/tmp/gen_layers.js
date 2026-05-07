const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('d:/AI/Kurabe/.understand-anything/intermediate/assembled-graph.json', 'utf8'));

const nodes = graph.nodes;

const layers = [
  {
    "id": "layer_presentation",
    "name": "Presentation (Pages)",
    "description": "App Router pages and layouts defining the UI structure.",
    "nodeIds": nodes.filter(n => n.id.startsWith('src\\app')).map(n => n.id)
  },
  {
    "id": "layer_components",
    "name": "UI Components",
    "description": "Reusable UI elements and business components.",
    "nodeIds": nodes.filter(n => n.id.startsWith('src\\components')).map(n => n.id)
  },
  {
    "id": "layer_logic",
    "name": "Business Logic (Actions)",
    "description": "Server actions and core business logic handlers.",
    "nodeIds": nodes.filter(n => n.id.startsWith('src\\actions')).map(n => n.id)
  },
  {
    "id": "layer_data",
    "name": "Data Access & Hooks",
    "description": "Custom hooks, DB wrappers, and API clients (Supabase).",
    "nodeIds": nodes.filter(n => n.id.startsWith('src\\hooks') || n.id.startsWith('src\\lib\\db')).map(n => n.id)
  },
  {
    "id": "layer_types",
    "name": "Types & Definitions",
    "description": "TypeScript interfaces and database type definitions.",
    "nodeIds": nodes.filter(n => n.id.startsWith('src\\types')).map(n => n.id)
  },
  {
    "id": "layer_infrastructure",
    "name": "Infrastructure & State",
    "description": "Context providers, auth, and base library utilities.",
    "nodeIds": nodes.filter(n => n.id.startsWith('src\\contexts') || n.id.startsWith('src\\providers') || (n.id.startsWith('src\\lib') && !n.id.startsWith('src\\lib\\db'))).map(n => n.id)
  },
  {
    "id": "layer_config",
    "name": "Configuration",
    "description": "Project-level config files (Next.js, TS, ESLint).",
    "nodeIds": nodes.filter(n => !n.id.startsWith('src\\')).map(n => n.id)
  }
];

fs.writeFileSync('d:/AI/Kurabe/.understand-anything/intermediate/layers.json', JSON.stringify(layers, null, 2));
console.log('Successfully generated layers.json');
