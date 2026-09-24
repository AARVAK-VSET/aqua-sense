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
  }
};

vm.runInNewContext(
  fs.readFileSync("src/lib/createWaterBall-jquery.js", "utf8"),
  context
);

const element = {};
const waterBall = jQuery(element);
waterBall.createWaterBall = jQuery.fn.createWaterBall;

waterBall.createWaterBall({
  targetRange: 80
});

const data = waterBall.data("waterBall");
const xOffsetBefore = data.config.wave_config.xOffset;
const rangeBefore = data.config.nowRange;

waterBall.createWaterBall("updateTheme", {
  textColorRange: ["#111", "#222", "#333"],
  circle_line_color: ["#444", "#555", "#666"],
  main_backcolor_range: [
    ["#777", "#888"],
    ["#bbb", "#ccc"],
    ["#ddd", "#eee"]
  ],
  backcolor_range: [
    ["#999", "#aaa"],
    ["#bbb", "#ccc"],
    ["#ddd", "#eee"]
  ],
  backgroundColor: "#000"
});

assert.strictEqual(
  JSON.stringify(data.config.textColorRange),
  JSON.stringify(["#111", "#222", "#333"])
);
assert.strictEqual(
  JSON.stringify(data.config.circle_line_color),
  JSON.stringify(["#444", "#555", "#666"])
);
assert.strictEqual(
  JSON.stringify(data.config.main_backcolor_range),
  JSON.stringify([
    ["#777", "#888"],
    ["#bbb", "#ccc"],
    ["#ddd", "#eee"]
  ])
);
assert.strictEqual(
  JSON.stringify(data.config.backcolor_range),
  JSON.stringify([
    ["#999", "#aaa"],
    ["#bbb", "#ccc"],
    ["#ddd", "#eee"]
  ])
);
assert.strictEqual(data.canvas.style.backgroundColor, "#000");
assert.strictEqual(data.config.wave_config.xOffset, xOffsetBefore);
assert.strictEqual(data.config.nowRange, rangeBefore);
assert.strictEqual(animationFrames.length, 1);

console.log("PASS: Water-ball theme updates preserve animation state.");
