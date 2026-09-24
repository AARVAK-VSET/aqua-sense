(function($){


    /*
     * Create an offscreen canvas buffer once during initialization.
     * The same canvas and 2D context are reused on every animation frame.
     */
    function createBufferCanvas(config) {
        var canvas = document.createElement('canvas');

        canvas.width = config.cvs_config.width;
        canvas.height = config.cvs_config.height;

        return {
            canvas: canvas,
            ctx: canvas.getContext('2d')
        };
    }

    /*
     * Draw a wave onto an existing offscreen canvas.
     * No canvas or temporary point arrays are created here.
     */
    function drawSin(xOffset, color1, color2, buffer) {
        var config = this.data('waterBall').config;
        var canvas = buffer.canvas;
        var ctx = buffer.ctx;

        ctx.clearRect(
            0,
            0,
            config.cvs_config.width,
            config.cvs_config.height
        );

        ctx.save();


        ctx.beginPath();

        ctx.arc(
            config.circle_config.r,
            config.circle_config.r,
            config.circle_config.cR - 5,
            0,
            2 * Math.PI
        );

        ctx.clip();
        ctx.closePath();

        ctx.beginPath();

        var w_sX = config.wave_config.sX,
            w_waveWidth = config.wave_config.waveWidth,
            w_waveHeight = config.wave_config.waveHeight,
            w_axisLength = config.wave_config.axisLength,
            c_width = config.cvs_config.width,
            c_height = config.cvs_config.height;

        /*
         * Instead of storing every point in an array,
         * remember only the first and last points needed later.
         */
        var firstX = null;
        var firstY = null;
        var lastY = null;

        for (
            var x = w_sX;
            x < w_sX + w_axisLength;
            x += 20 / w_axisLength
        ) {

            var y = -Math.sin(
                (w_sX + x) * w_waveWidth + xOffset
            );

            var dY = c_height * (
                1 - config.nowRange / 100
            );

            var pointY = dY + y * w_waveHeight;

            if (firstX === null) {
                firstX = x;
                firstY = pointY;
            }

            lastY = pointY;

            ctx.lineTo(x, pointY);
        }

        ctx.lineTo(w_axisLength, c_height);
        ctx.lineTo(w_sX, c_height);
        ctx.lineTo(firstX, firstY);

        var gradient = ctx.createLinearGradient(
            0,
            c_height,
            c_width,
            lastY
        );

        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);

        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.restore();

        if (!config.isLoading) {

            ctx.save();

            var size = 0.4 * config.circle_config.cR;

            ctx.font = size + 'px Microsoft Yahei';
            ctx.textAlign = 'center';

            ctx.fillStyle =
                config.textColorRange[getIndex.call(this)];

            ctx.fillText(
                ~~config.nowRange + '%',
                config.circle_config.r,
                config.circle_config.r + size / 2
            );

            ctx.restore();
        }

        return canvas;
    }

    /*
     * Draw the outer circle onto an existing offscreen canvas.
     */
    function drawCircle(buffer) {

        var config = this.data('waterBall').config;
        var canvas = buffer.canvas;
        var ctx = buffer.ctx;

        ctx.clearRect(
            0,
            0,
            config.cvs_config.width,
            config.cvs_config.height
        );

        ctx.lineWidth = config.lineWidth;

        ctx.beginPath();

        ctx.strokeStyle =
            config.circle_line_color[getIndex.call(this)];

        ctx.arc(
            config.circle_config.r,
            config.circle_config.r,
            config.circle_config.cR,
            0,
            2 * Math.PI
        );

        ctx.stroke();

        return canvas;
    }

    function getIndex() {

        var config = this.data('waterBall').config;

        for (
            var i = 0, data = config.data_range;
            i < data.length;
            i++
        ) {

            if (config.nowRange < data[i]) {
                return i;
            }
        }

        return data.length - 1;
    }

    var methods = {

        init: function(config) {

            return this.each(function(){

                var $this = $(this),
                    data = $this.data('waterBall'),

                    _config = {

                        cvs_config: {
                            width: 220,
                            height: 220
                        },

                        wave_config: {
                            sX: 0,
                            sY: 220 / 2,
                            waveWidth: 0.015,
                            waveHeight: 5,
                            axisLength: 220,
                            speed: 0.09,
                            xOffset: 0
                        },

                        circle_config: {
                            r: 220 / 2,
                            cR: 220 / 2 - 5
                        },

                        isLoading: false,
                        nowRange: 0,
                        targetRange: 0,

                        lineWidth: 2,

                        data_range: [60, 80, 100],

                        textColorRange: [
                            '#fe5022',
                            '#fff',
                            '#fff'
                        ],

                        circle_line_color: [
                            '#fe3702',
                            '#ffa200',
                            '#4ed752'
                        ],

                        main_backcolor_range: [
                            ['#fe5e21', '#f98957'],
                            ['#ffb30c', '#f7d35a'],
                            ['#2ed351', '#8ced6c']
                        ],

                        backcolor_range: [
                            ['#f76b3b', '#f14f17'],
                            ['#f4d672', '#ffb50d'],
                            ['#43ea83', '#12ce55']
                        ]
                    };

                if (!data) {

                    var wave_config = {};
                    var circle_config = {};

                    if (config.cvs_config) {

                        wave_config = {
                            sY: config.cvs_config.width / 2,
                            axisLength: config.cvs_config.width
                        };

                        circle_config = {
                            r: config.cvs_config.width / 2,
                            cR: config.cvs_config.width / 2 - 5
                        };
                    }

                    $.extend(
                        true,
                        _config,
                        {
                            wave_config: wave_config,
                            circle_config: circle_config
                        },
                        config
                    );

                    /*
                     * Main visible canvas.
                     * Created once.
                     */
                    var canvas = document.createElement('canvas');

                    canvas.width =
                        _config.cvs_config.width;

                    canvas.height =
                        _config.cvs_config.height;

                    $this.html("").html($(canvas));

                    /*
                     * Main canvas context is also created once.
                     */
                    var ctx = canvas.getContext('2d');

                    /*
                     * Three offscreen buffers.
                     * Created once and reused forever.
                     */
                    var buffers = {

                        circle:
                            createBufferCanvas(_config),

                        wave1:
                            createBufferCanvas(_config),

                        wave2:
                            createBufferCanvas(_config)
                    };

                    /*
                     * Store all reusable rendering resources.
                     */
                    var waterBallData = {

                        canvas: canvas,

                        ctx: ctx,

                        target: $this,

                        config: _config,

                        buffers: buffers
                    };

                    /*
                     * Bind render only once.
                     * Previously this was being created on every frame.
                     */
                    waterBallData.render =
                        methods.render.bind($this);

                    $this.data(
                        'waterBall',
                        waterBallData
                    );

                    methods.render.apply($this);
                }
            });
        },

        destroy: function() {
        },

        updateRange: function(newVal) {

            return this.each(function(){

                var $this = $(this),
                    data = $this.data('waterBall');

                if (!data) {
                    return;
                }

                var config =
                    $this.data('waterBall').config;

                config.targetRange = 0;
                config.nowRange = 0;
                config.isLoading = false;

                setTimeout(function(){

                    config.targetRange = newVal;

                }, 0);
            });
        },

        updateConfig: function (newConfig) {
            return this.each(function () {
                var $this = $(this),
                    data = $this.data('waterBall');
                if (!data || !newConfig) return;

                $.extend(true, data.config, newConfig);
            });
        },

        updateTheme: function (newConfig) {
            return methods.updateConfig.apply(this, arguments);
        },

        refreshTheme: function (newConfig) {
            return methods.updateConfig.apply(this, arguments);
        },

        render: function() {

            var data =
                this.data('waterBall');

            var config =
                data.config;

            var buffers =
                data.buffers;

            /*
             * Reuse the main canvas context.
             * No getContext() call is required every frame.
             */
            var ctx =
                data.ctx;

            var xOffset =
                config.wave_config.xOffset;

            var bg_color1 =
                config.backcolor_range[
                    getIndex.call(this)
                ][0];

            var bg_color2 =
                config.backcolor_range[
                    getIndex.call(this)
                ][1];

            var main_bg_color1 =
                config.main_backcolor_range[
                    getIndex.call(this)
                ][0];

            var main_bg_color2 =
                config.main_backcolor_range[
                    getIndex.call(this)
                ][1];

            /*
             * Reuse the existing circle buffer.
             */
            drawCircle.call(
                this,
                buffers.circle
            );

            if (
                config.nowRange <=
                config.targetRange
            ) {

                var tmp = 1;

                config.nowRange += tmp;
            }

            if (
                config.nowRange >
                config.targetRange
            ) {

                var tmp = 1;

                config.nowRange -= tmp;
            }

            /*
             * Reuse wave buffer 1.
             */
            drawSin.call(
                this,
                xOffset + 40,
                bg_color1,
                bg_color2,
                buffers.wave1
            );

            /*
             * Reuse wave buffer 2.
             */
            drawSin.call(
                this,
                -40 + xOffset,
                main_bg_color1,
                main_bg_color2,
                buffers.wave2
            );

            /*
             * Clear the visible canvas and
             * composite the three reusable buffers.
             */
            ctx.clearRect(
                0,
                0,
                config.cvs_config.width,
                config.cvs_config.height
            );

            ctx.drawImage(
                buffers.circle.canvas,
                0,
                0
            );

            ctx.drawImage(
                buffers.wave1.canvas,
                0,
                0
            );

            ctx.drawImage(
                buffers.wave2.canvas,
                0,
                0
            );

            config.wave_config.xOffset +=
                config.wave_config.speed;

            /*
             * Reuse the function created during initialization.
             */
            requestAnimationFrame(
                data.render
            );

        }
    };

    $.fn.createWaterBall = function(method) {

        if (methods[method]) {

            return methods[method].apply(
                this,
                Array.prototype.slice.call(
                    arguments,
                    1
                )
            );

        } else if (
            typeof method === 'object' ||
            !method
        ) {

            return methods.init.apply(
                this,
                arguments
            );

        } else {

            $.error(
                'Method ' +
                method +
                'does not exits on jQuery.createWaterBall'
            );
        }
    };

})(jQuery);