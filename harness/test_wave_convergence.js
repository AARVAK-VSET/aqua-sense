const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const animationFrames = [];

function createContext() {
  return {
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
    createLinearGradient() {
      return { addColorStop() {} };
    }
  };
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
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
  },
  cancelAnimationFrame() {}
};

vm.runInNewContext(
  fs.readFileSync("src/lib/createWaterBall-jquery.js", "utf8"),
  context
);

function advanceFrame() {
  const next = animationFrames.shift();
  assert.ok(next, "expected a pending animation frame");
  next();
}

function advanceFrames(count) {
  for (let i = 0; i < count; i++) {
    advanceFrame();
  }
}

const element = {};
const waterBall = jQuery(element);
waterBall.createWaterBall = jQuery.fn.createWaterBall;

waterBall.createWaterBall({
  targetRange: 50
});

const data = waterBall.data("waterBall");

// --- 1. Convergence within tolerance -----------------------------------
advanceFrames(200);

assert.ok(
  Math.abs(data.config.nowRange - 50) < 1,
  `expected nowRange to converge near 50, got ${data.config.nowRange}`
);

// --- 2. Steady-state stability -------------------------------------------
const settledValue = data.config.nowRange;

advanceFrames(20);

assert.strictEqual(
  data.config.nowRange,
  settledValue,
  "nowRange oscillated at steady state instead of staying stable"
);

// --- 3. No reset-to-zero on updateRange ----------------------------------
waterBall.createWaterBall("updateRange", 80);

assert.strictEqual(
  data.config.targetRange,
  80,
  "targetRange should update immediately to the new value"
);

assert.ok(
  data.config.nowRange > 40,
  `updateRange must not reset nowRange to 0, got ${data.config.nowRange}`
);

// --- 4. Convergence to the new target within tolerance -------------------
advanceFrames(200);

assert.ok(
  Math.abs(data.config.nowRange - 80) < 1,
  `expected nowRange to converge near 80, got ${data.config.nowRange}`
);

const settledAtNewTarget = data.config.nowRange;

advanceFrames(20);

assert.strictEqual(
  data.config.nowRange,
  settledAtNewTarget,
  "nowRange oscillated at steady state after updateRange"
);

console.log(
  "PASS: Wave animation converges smoothly, stays stable at steady state, " +
    "and updateRange preserves current progress."
);