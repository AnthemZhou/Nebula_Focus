const {readFileSync} = require('node:fs');
const stylesheet = readFileSync('styles.css', 'utf8');
const start = stylesheet.indexOf('/* Transient geometry surfaces.');
if (start < 0) throw Error('Missing plugin geometry stylesheet');

module.exports = function loadGeometryStyles(document) {
  const style = document.createElement('style');
  style.textContent = stylesheet.slice(start);
  document.head.append(style);
};
