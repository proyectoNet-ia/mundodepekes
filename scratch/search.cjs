const fs = require('fs');
const content = fs.readFileSync('src/modules/dashboard/Dashboard.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('todos salen a las') || line.includes('restantes')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
