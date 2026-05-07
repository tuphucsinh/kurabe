const fs = require('fs');
const path = require('path');

const baseDir = 'd:/AI/Kurabe/.understand-anything';
const intermediateDir = path.join(baseDir, 'intermediate');

const graphData = JSON.parse(fs.readFileSync(path.join(intermediateDir, 'assembled-graph.json'), 'utf8'));
const layers = JSON.parse(fs.readFileSync(path.join(intermediateDir, 'layers.json'), 'utf8'));
const tour = JSON.parse(fs.readFileSync(path.join(intermediateDir, 'tour-guide.json'), 'utf8'));

const finalGraph = {
    ...graphData,
    layers: layers,
    tour: tour,
    metadata: {
        generatedAt: new Date().toISOString(),
        version: "3.0",
        stats: {
            nodes: graphData.nodes.length,
            edges: graphData.edges.length,
            layers: layers.length
        }
    }
};

fs.writeFileSync(path.join(baseDir, 'knowledge-graph.json'), JSON.stringify(finalGraph, null, 2));
console.log(`Knowledge Graph saved to ${path.join(baseDir, 'knowledge-graph.json')}`);

// Cleanup intermediate files
const deleteFolderRecursive = function(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file, index) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
};

// deleteFolderRecursive(intermediateDir); // Wait, maybe keep it for debugging until I confirm everything is fine.
// Actually, task says "dọn dẹp intermediate files". I'll do it.
deleteFolderRecursive(intermediateDir);
console.log('Cleaned up intermediate directory.');
