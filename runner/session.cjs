'use strict';

const sessionProcess = process;
// Without its supervisor nothing would reload, stop or wait for this game (upstream PMJS eedfd6b).
sessionProcess.once('disconnect', () => {
  try { require('node:fs').writeSync(2, '[pmjs] Supervisor connection lost; stopping session\n'); } catch (_) {}
  sessionProcess.exit(1);
});
const { run } = require('./index.cjs');
sessionProcess.once('message', async options => {
  try {
    const result = await run({ ...options, supervised: true });
    sessionProcess.send({ type: 'pmjs-session-complete', reload: !!(result && result.reload) }, error => {
      if (error) console.error(error);
      sessionProcess.exit(error ? 1 : 0);
    });
  } catch (error) {
    console.error(error && error.stack || error);
    sessionProcess.exit(1);
  }
});
