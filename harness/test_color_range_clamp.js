const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function createContext() {
  var ctx = {
    clearRect() {},
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    arc() {},
    clip() {},
    lineTo() {},
    fill() {},
    stroke() {},
    fillText() {},
    lastGradientColors: null,
    createLinearGradient() {
      return {
        addColorStop(offset, color) {
          ctx.lastGradientColors = ctx.lastGradientColors || [];
          ctx.lastGradientColors[offset] = color;
        }
      };
    }
  };
  return ctx;
}

function createCanvas() {
  return {
    style: {},
    getContext() {
      return createContext();
    }
  };
}

function createJQuery(element) {
  return {
    0: element,
    length: 1,
    each(callback) {
      callback.call(element, 0, element);
      return this;
    },
    data(key, value) {
      element.data = element.data || {};
      if (arguments.length === 2) {
        element.data[key] = value;
        return this;
      }
      return element.data[key];
    },
    html() {
      return this;
    }
  };
}

function jQuery(value) {
  return createJQuery(value);
}

jQuery.fn = {};
jQuery.extend = function(target, ...sources) {
  if (target === true) {
    target = sources.shift();
  }

  sources.forEach(source => {
    Object.keys(source || {}).forEach(key => {
      if (
        target[key] &&
        typeof target[key] === "object" &&
        typeof source[key] === "object"
      ) {
        jQuery.extend(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    });
  });
  return target;
};

const context = {
  jQuery,
  document: {
    createElement(type) {
      assert.strictEqual(type, "canvas");
      const canvas = createCanvas();
      canvas.width = 0;
      canvas.height = 0;
      return canvas;
    }
  },
  requestAnimationFrame() {}
};

vm.runInNewContext(
  fs.readFileSync("src/lib/createWaterBall-jquery.js", "utf8"),
  context
);

// A custom 4-tier data_range, with backcolor_range/main_backcolor_range
// left at their default 3-entry length -- exactly the mismatch described
// in issue #54 ("custom 4-tier data range intervals").
const element = {};
const waterBall = jQuery(element);
waterBall.createWaterBall = jQuery.fn.createWaterBall;

waterBall.createWaterBall({
  targetRange: 0,
  data_range: [25, 50, 75, 100]
});

const data = waterBall.data("waterBall");

function drawAtRange(nowRange) {
  data.config.nowRange = nowRange;

  // updateTheme always ends by redrawing with the current config, so an
  // otherwise-empty theme update is a safe way to trigger drawFrame with
  // whatever nowRange/data_range we just set, without waiting on animation.
  waterBall.createWaterBall("updateTheme", {});

  return {
    wave1: data.buffers.wave1.ctx.lastGradientColors,
    wave2: data.buffers.wave2.ctx.lastGradientColors
  };
}

function assertSameColors(actual, expected, label) {
  assert.strictEqual(
    JSON.stringify(actual),
    JSON.stringify(expected),
    label
  );
}

// Tiers 0-2 map directly onto the 3 available colors.
assert.doesNotThrow(() => drawAtRange(10));
let colors = drawAtRange(10);
assertSameColors(colors.wave1, data.config.backcolor_range[0], "tier 0 (nowRange 10, index 0) background color");
assertSameColors(colors.wave2, data.config.main_backcolor_range[0], "tier 0 (nowRange 10, index 0) main color");

colors = drawAtRange(30);
assertSameColors(colors.wave1, data.config.backcolor_range[1], "tier 1 (nowRange 30, index 1) background color");
assertSameColors(colors.wave2, data.config.main_backcolor_range[1], "tier 1 (nowRange 30, index 1) main color");

colors = drawAtRange(60);
assertSameColors(colors.wave1, data.config.backcolor_range[2], "tier 2 (nowRange 60, index 2) background color");
assertSameColors(colors.wave2, data.config.main_backcolor_range[2], "tier 2 (nowRange 60, index 2) main color");

// Tier 3 (75-100, the 4th configured interval, index 3) has no matching
// color entry -- only indices 0-2 exist. Before the fix this threw:
// "Cannot read properties of undefined (reading '0')". It should now
// clamp to the last available color (index 2) instead of crashing.
assert.doesNotThrow(() => drawAtRange(90));
colors = drawAtRange(90);
assertSameColors(colors.wave1, data.config.backcolor_range[2], "tier 3 (nowRange 90) clamps to last background color");
assertSameColors(colors.wave2, data.config.main_backcolor_range[2], "tier 3 (nowRange 90) clamps to last main color");

// The very top of the range (falls off the end of the loop entirely)
// should clamp the same way.
assert.doesNotThrow(() => drawAtRange(100));
colors = drawAtRange(100);
assertSameColors(colors.wave1, data.config.backcolor_range[2], "nowRange 100 clamps to last background color");
assertSameColors(colors.wave2, data.config.main_backcolor_range[2], "nowRange 100 clamps to last main color");

console.log("PASS: Custom 4-tier data_range clamps to the last available color instead of crashing.");
