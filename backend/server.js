'use strict';

const app  = require('./src/app');
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log('');
  console.log('  ⚽  WC2026 Prediction Engine API');
  console.log(`  🚀  Server running on http://localhost:${port}`);
  console.log(`  🔗  Health: http://localhost:${port}/api/health`);
  console.log(`  📋  Matches: http://localhost:${port}/api/matches`);
  console.log(`  🎯  Predict: http://localhost:${port}/api/predictions/{matchId}`);
  console.log('');
});
