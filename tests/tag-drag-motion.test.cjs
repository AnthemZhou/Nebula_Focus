const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const loadGeometryStyles = require('./load-geometry-styles.cjs');
const moduleValue = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/tag-drag-motion.ts', 'utf8'),
  {loader: 'ts', format: 'cjs'}).code)(moduleValue, moduleValue.exports);
const {TagDragMotion} = moduleValue.exports;

function fixture(t, reduced = false) {
  const dom = new JSDOM('<body><div class="list"></div></body>', {pretendToBeVisual: true});
  t.after(() => dom.window.close());
  const {document: doc} = dom.window, list = doc.querySelector('.list'), animations = [];
  loadGeometryStyles(doc);
  dom.window.matchMedia = () => ({matches: reduced});
  const rect = (top, left = 20, width = 240, height = 40) =>
    ({top, left, width, height, right: left + width, bottom: top + height, x: left, y: top});
  list.getBoundingClientRect = () => rect(100, 20, 240, 120);
  const rows = ['A', 'B', 'C'].map(value => {
    const row = doc.createElement('div'); row.dataset.value = value; row.id = `option-${value}`;
    row.setAttribute('role', 'option');
    const handle = doc.createElement('button'); handle.id = `handle-${value}`; handle.textContent = value;
    row.append(handle); list.append(row);
    row.getBoundingClientRect = () => rect(100 + [...list.children].indexOf(row) * 40 - list.scrollTop);
    return row;
  });
  dom.window.HTMLElement.prototype.animate = function(frames, options) {
    const animation = {element: this, frames, options, cancelled: false, onfinish: null,
      cancel() {this.cancelled = true;}};
    animations.push(animation); return animation;
  };
  const motion = new TagDragMotion(list, rows[0], 40, 120);
  t.after(() => motion.dispose());
  return {dom, doc, list, rows, motion, animations};
}

test('drag lifts an inert visual copy while keeping the real option as a placeholder', t => {
  const f = fixture(t);
  f.rows[0].style.setProperty('--bui-source-tag-font-size', '19px');
  f.rows[0].style.setProperty('--bui-source-tag-font-family', 'Custom CJK');
  f.rows[0].style.setProperty('--bui-source-tag-line-height', '25px');
  f.motion.move(48, 165);
  const ghost = f.doc.querySelector('.bui-tag-drag-overlay');
  assert(ghost); assert.equal(ghost.inert, true); assert.equal(ghost.getAttribute('aria-hidden'), 'true');
  assert.equal(ghost.style.pointerEvents, 'none'); assert.equal(ghost.querySelector('[id]'), null);
  assert.equal(ghost.getAttribute('role'), null); assert.equal(ghost.querySelector('button').tabIndex, -1);
  assert.equal(f.dom.window.getComputedStyle(f.rows[0]).visibility, 'hidden');
  assert.equal(f.rows[0].style.visibility, '', 'drag leaves the original inline visibility untouched');
  assert.equal(f.list.children[0], f.rows[0]);
  assert.equal(ghost.style.transform, 'translate3d(28px, 145px, 0)');
  assert.equal(ghost.style.getPropertyValue('--bui-source-tag-font-size'), '19px');
  assert.equal(ghost.style.getPropertyValue('--bui-source-tag-font-family'), 'Custom CJK');
  assert.equal(ghost.style.getPropertyValue('--bui-source-tag-line-height'), '25px');
  f.motion.dispose();
  assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'), null);
  assert.equal(f.rows[0].style.visibility, ''); assert.equal(f.rows[0].classList.contains('bui-tag-drag-placeholder'), false);
});

test('peers animate to destination slots and the drop completes exactly once after landing', t => {
  const f = fixture(t); f.motion.move(40, 200); f.motion.reorder([f.rows[1], f.rows[2], f.rows[0]]);
  assert.deepEqual([...f.list.children], [f.rows[1], f.rows[2], f.rows[0]]);
  assert.equal(f.animations.length, 2); assert.equal(f.animations[0].frames[0].transform, 'translate(0px, 40px)');
  f.list.scrollTop = 12;
  assert.deepEqual(f.motion.rect(f.rows[1]), {top: 88, height: 40});
  let commits = 0; f.motion.finish(() => commits++);
  assert.equal(commits, 0); const drop = f.animations.at(-1), finish = drop.onfinish;
  assert.equal(drop.options.duration, 140); finish(); finish();
  assert.equal(commits, 1); assert.equal(drop.cancelled, true);
  assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'), null); assert.equal(f.rows[0].style.visibility, '');
});

test('closing during a landing cancels animations and cannot commit through a late completion', t => {
  const f = fixture(t); f.motion.move(40, 200); f.motion.reorder([f.rows[1], f.rows[2], f.rows[0]]);
  let commits = 0; f.motion.finish(() => commits++); const finish = f.animations.at(-1).onfinish;
  f.motion.dispose(); finish(); f.motion.move(50, 210);
  assert.equal(commits, 0); assert(f.animations.every(animation => animation.cancelled));
  assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'), null); assert.equal(f.rows[0].style.visibility, '');
});

test('reduced motion retains direct drag feedback and completes without transition delays', t => {
  const f = fixture(t, true); f.motion.move(40, 200); f.motion.reorder([f.rows[1], f.rows[2], f.rows[0]]);
  assert(f.doc.querySelector('.bui-tag-drag-overlay')); let commits = 0;
  f.motion.finish(() => commits++);
  assert.equal(commits, 1); assert.equal(f.animations.length, 0);
  assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'), null); assert.equal(f.rows[0].style.visibility, '');
});
