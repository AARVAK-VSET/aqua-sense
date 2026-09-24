const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const canvasCtx = {
  save() {},
  restore() {},
  beginPath() {},
  clip() {},
  closePath() {},
  lineTo() {},
  arc() {},
  fill() {},
  stroke() {},
  clearRect() {},
  drawImage() {},
  fillText() {},
  createLinearGradient() { return { addColorStop() {} }; }
};

const store = new WeakMap();

function makeElement() {
  return {
    width: 200,
    height: 200,
    innerHTML: '',
    style: {},
    getContext() {
      return canvasCtx;
    }
  };
}

function $(element) {
  if (!store.has(element)) {
    store.set(element, {});
  }

  const dataStore = store.get(element);

  return {
    data(key, value) {
      if (typeof value === 'undefined') {
        return dataStore[key];
      }
      dataStore[key] = value;
      return this;
    },
    html(value) {
      if (typeof value === 'undefined') {
        return element.innerHTML;
      }
      element.innerHTML = value;
      return this;
    },
    width() {
      return element.width;
    },
    height() {
      return element.height;
    }
  };
}

$.fn = {};
$.extend = function extend(target, ...sources) {
  let output = arguments[0] || {};
  const deep = arguments[0] === true;

  if (deep) {
    output = arguments[1] || {};
  }

  for (let i = deep ? 2 : 1; i < arguments.length; i += 1) {
    const source = arguments[i];
    if (!source) continue;

    Object.keys(source).forEach((key) => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
        output[key] = extend(true, output[key], value);
      } else {
        output[key] = value;
      }
    });
  }

  return output;
};
$.error = (msg) => {
  throw new Error(msg);
};

global.window = { requestAnimationFrame: () => {} };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.document = {
  createElement: () => makeElement()
};
global.jQuery = $;

vm.runInNewContext(fs.readFileSync('src/lib/createWaterBall-jquery.js', 'utf8'), {
  $,
  window: global.window,
  document: global.document,
  jQuery: $,
  console
});

const el = makeElement();
const collection = {
  length: 1,
  0: el,
  each(callback) {
    callback.call(this[0]);
    return this;
  }
};

collection.createWaterBall = $.fn.createWaterBall;
collection.createWaterBall({ targetRange: 50 });

const newTheme = {
  backcolor_range: [['#111111', '#222222'], ['#333333', '#444444'], ['#555555', '#666666']],
  main_backcolor_range: [['#777777', '#888888'], ['#999999', '#aaaaaa'], ['#bbbbbb', '#cccccc']],
  textColorRange: ['#111111', '#222222', '#333333'],
  circle_line_color: ['#444444', '#555555', '#666666']
};

assert.doesNotThrow(() => {
  collection.createWaterBall('updateConfig', newTheme);
}, 'Expected the water-ball plugin to support dynamic theme updates');

const config = $(el).data('waterBall').config;
assert.deepStrictEqual(config.backcolor_range, newTheme.backcolor_range);
assert.deepStrictEqual(config.main_backcolor_range, newTheme.main_backcolor_range);
assert.deepStrictEqual(config.textColorRange, newTheme.textColorRange);
assert.deepStrictEqual(config.circle_line_color, newTheme.circle_line_color);

console.log('waterball dynamic theme update test passed');
