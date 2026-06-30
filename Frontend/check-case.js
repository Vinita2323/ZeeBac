import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const fileMap = new Map();
walk('./src', (filePath) => {
  fileMap.set(filePath.toLowerCase().replace(/\\/g, '/'), filePath.replace(/\\/g, '/'));
});

walk('./src', (filePath) => {
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        const dir = path.dirname(filePath);
        let resolvedPath = path.resolve(dir, importPath);
        
        let found = false;
        let extensions = ['', '.js', '.jsx', '/index.js', '/index.jsx'];
        for (let ext of extensions) {
           let tryPath = resolvedPath + ext;
           tryPath = path.relative('.', tryPath).replace(/\\/g, '/');
           let lowerPath = tryPath.toLowerCase();
           if (fileMap.has(lowerPath)) {
             const actualPath = fileMap.get(lowerPath);
             // Compare case
             const actualParts = actualPath.split('/');
             const tryParts = tryPath.split('/');
             for(let i=0; i<actualParts.length; i++) {
                if(actualParts[i] !== tryParts[i] && actualParts[i].toLowerCase() === tryParts[i].toLowerCase()) {
                    console.log(`Mismatch in ${filePath}:\n  Imported: ${importPath}\n  Actual file: ${actualPath}`);
                }
             }
             found = true;
             break;
           }
        }
      }
    }
  }
});
