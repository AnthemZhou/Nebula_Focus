const {inspect} = require('node:util');

// Consume Node's structured events rather than parsing TAP/terminal formatting.
// Passing cases stay quiet; failures and test-emitted output remain visible.
module.exports = async function* summary(source) {
  const totals = {};
  for await (const event of source) {
    const data = event.data;
    if (event.type === 'test:fail') {
      yield `FAIL ${data.name}\n${data.file || ''}${data.line ? ':' + data.line : ''}\n`;
      yield inspect(data.details?.error, {colors: false, depth: 5}) + '\n';
    } else if (event.type === 'test:stdout' || event.type === 'test:stderr') {
      yield data.message;
    } else if (event.type === 'test:diagnostic') {
      const match = /^(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)$/.exec(data.message);
      if (match && data.nesting === 0) {
        totals[match[1]] = Number(match[2]);
        if (match[1] === 'duration_ms') yield `${totals.pass ?? 0}/${totals.tests ?? 0} passed; ${totals.fail ?? 0} failed; ` +
          `${totals.cancelled ?? 0} cancelled; ${totals.skipped ?? 0} skipped; ${totals.todo ?? 0} todo; ${(totals.duration_ms / 1000).toFixed(2)}s.\n`;
      } else {
        yield `# ${data.message}\n`;
      }
    }
  }
};
