"use strict";

(function() {

    const CIRCLE = Math.PI * 2;

    const cnv = document.querySelector('#cnv');
    const ctx = cnv.getContext('2d');

    class Controls {
        constructor() {
            this.codes = {
                37: 'left',
                39: 'right',
                38: 'forward',
                40: 'backward'
            };
            this.states = {
                'left': false,
                'right': false,
                'forward': false,
                'backward': false
			}
            window.addEventListener('keydown', (event) => {this.onKey(true, event)});
            window.addEventListener('keyup', (event) => {this.onKey(false, event)});
		}

        onKey(value, event) {
            const state = this.codes[event.keyCode];
            if (!state) return;
			this.states[state] = value;
			event.stopPropagation();
            event.preventDefault();
        }
    }

    class Bitmap {
        constructor({src, width, height}) {
			this.width = width;
			this.height = height;
            this.image = new Image();
            this.image.src = src;
        }
    }

    class Player {
        constructor({x, y, direction}) {
			this.x = x;
			this.y = y;
			this.direction = direction;
        }

        rotate(angle) {
            this.direction = (this.direction + angle + CIRCLE) % CIRCLE;
        }

        walk({distance, map}) {
            const dx = Math.cos(this.direction) * distance;
            const dy = Math.sin(this.direction) * distance;

            if (map.get(this.x + dx, this.y) <= 0) this.x += dx;
            if (map.get(this.x, dx + this.y) <= 0) this.y += dy;
        }

        update({controls, map, seconds}) {
            if (controls.left) this.rotate(-Math.PI * seconds);
            if (controls.right) this.rotate(Math.PI * seconds);
            if (controls.forward) {
                this.walk({
                    distance: 3 * seconds, map: map
                });
            }
            if (controls.backward) {
                this.walk({
                    distance: -3 * seconds, map: map
                });
			}
        }
    }

    class Map {
        constructor({size}) {
			this.size = size;
            this.wallGrid = new Uint8Array(size * size);
            this.skybox = new Bitmap({
                src: './assets/deathvalley_panorama.jpg', width: 2000, height: 750
            });
            this.wallTexture = new Bitmap({
                src: './assets/wall_texture.jpg', width: 1024, height: 1024
            });
            this.light = 0;
        }

        get(x, y) {
            x = Math.floor(x);
            y = Math.floor(y);
            if (x < 0 || x > this.size - 1 ||
                y < 0 || y > this.size - 1) return -1;
            return this.wallGrid[y * this.size + x];
        }

        randomize() {
            const mapLength = this.size * this.size;
            for (let i = 0; i < mapLength; i++) {
                this.wallGrid[i] = Math.random() < .3 ? 1 : 0;
			}
        }

        cast({point, angle, range}) {
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
			const noWall = { length2: Infinity };
			
			const ray = origin => {
                const stepX = step(sin, cos, origin.x, origin.y);
                const stepY = step(cos, sin, origin.y, origin.x, true);
                const nextStep = stepX.length2 < stepY.length2
                                    ? inspect(stepX, 1, 0, origin.distance, stepX.y)
                                    : inspect(stepY, 0, 1, origin.distance, stepY.x);
                if (nextStep.distance > range) return [origin];
                return [origin].concat(ray(nextStep));
            }

            const step = (rise, run, x, y, inverted) => {
                if (run === 0) return noWall;
                const dx = run > 0 ? Math.floor(x + 1) - x : Math.ceil(x - 1) - x;
                const dy = dx * (rise / run);
                return {
                    x: inverted ? y + dy : x + dx,
                    y: inverted ? x + dx : y + dy,
                    length2: dx * dx + dy * dy
                };
			};
			
            const inspect = (step, shiftX, shiftY, distance, offset) => {
                const dx = cos < 0 ? shiftX : 0;
                const dy = sin < 0 ? shiftY : 0;
                step.height = this.get(step.x - dx, step.y - dy);
                step.distance = distance + Math.sqrt(step.length2);
                if (shiftX) step.shading = cos < 0 ? 2 : 0;
                else step.shading = sin < 0 ? 2 : 1;
                step.offset = offset - Math.floor(offset);
                return step;
            }

            return ray({x: point.x, y: point.y, height: 0, distance: 0});

		}
		
		update(seconds) {
			if (this.light > 0) this.light = Math.max(this.light - 10 * seconds, 0);
			else if (Math.random() * 5 < seconds) this.light = 2;
		}
	}
	
	class Camera {
		constructor ({canvas, resolution, focalLength}) {
			this.ctx = canvas.getContext('2d');
			this.width = canvas.width = window.innerWidth;
			this.height = canvas.height = window.innerHeight;
			this.resolution = resolution;
			this.spacing = this.width / resolution;
			this.focalLength = focalLength || .8;
			this.range = 14;
			this.lightRange = 5;
			this.scale = (this.width / this.height) / 1200;
		}

		render(player, map) {
			this.ctx.clearRect(0, 0, this.width, this.height);
			this.drawSky(player.direction, map.skybox, map.light);
			this.drawColumns(player, map);
		}

		drawSky(direction, sky, ambient) {
			const width = sky.width * (this.height / sky.height) * 2;
			const left = (direction / CIRCLE) * -width;

			this.ctx.save();
			this.ctx.drawImage(sky.image, left, 0, width, this.height);
			if (left < width - this.width) {
				this.ctx.drawImage(sky.image, left + width, 0, width, this.height);
			}
			if (ambient > 0) {
				this.ctx.fillStyle = '#ffffff';
				this.ctx.globalAlpha = ambient * .1;
				this.ctx.fillRect(0, this.height * .5, this.width, this.height * .5);
			}
			this.ctx.restore();
		}

		drawColumns(player, map) {
			this.ctx.save();
			for (let column = 0; column < this.resolution; column++) {
				const x = column / this.resolution - .5;
				const angle = Math.atan2(x, this.focalLength);
				const ray = map.cast({
					point: player, angle: player.direction + angle, range: this.range
				});
				this.drawColumn(column, ray, angle, map);
			}
			this.ctx.restore();
		}

		drawColumn(column, ray, angle, map) {
			const texture = map.wallTexture;
			const left = Math.floor(column * this.spacing);
			const width = Math.ceil(this.spacing);
			let hit = -1;

			while (++hit < ray.length && ray[hit].height <= 0);

			for (let s = ray.length - 1; s>= 0; s--) {
				const step = ray[s];
				let rainDrops = Math.pow(Math.random(), 3) * s;
				const rain = (rainDrops > 0) && this.project(.1, angle, step.distance);

				if (s === hit) {
					const textureX = Math.floor(texture.width * step.offset);
					const wall = this.project(step.height, angle, step.distance);

					this.ctx.globalAlpha = 1;
					this.ctx.drawImage(texture.image, textureX, 0, 1, texture.height, left, wall.top, width, wall.height);

					this.ctx.fillStyle = '#000';
					this.ctx.globalAlpha = Math.max((step.distance + step.shading) / this.lightRange - map.light, 0);
					this.ctx.fillRect(left, wall.top, width, wall.height);
				}

				this.ctx.fillStyle = '#fff';
				this.ctx.globalAlpha = .15;
				while (--rainDrops > 0) ctx.fillRect(left, Math.random() * rain.top, 1, rain.height);
			}

		}

		project(height, angle, distance) {
			const z = distance * Math.cos(angle);
			const wallHeight = this.height * height / z;
			const bottom = this.height / 2 * (1 + 1 / z);
			return {
				top: bottom - wallHeight,
				height: wallHeight
			}
		}
	}

	class GameLoop {
		constructor() {
			this.lastTime = 0;
			this.callback = null;
		}

		start(callback) {
			this.callback = callback;
			requestAnimationFrame(this.frame.bind(this));
		}

		frame(time) {
			const seconds = (time - this.lastTime) / 1000;
			this.lastTime = time;
			if (seconds < .2) this.callback(seconds);
			requestAnimationFrame(this.frame.bind(this)); 
		}
	}

	(function() {
		const display = document.querySelector('#cnv');
		const player = new Player({
			x: 15.3, 
			y: -1.2,
			direction: Math.PI * .3
		});
		const map = new Map({
			size: 32
		});
		const controls = new Controls();
		const camera = new Camera({
			canvas: display, 
			resolution: 320, 
			focalLength: .8
		});
		const loop = new GameLoop();

		map.randomize();

		loop.start((seconds) => {
			map.update(seconds);
			player.update({
				controls: controls.states, 
				map, 
				seconds
			});
			camera.render(player, map);
		})
	})();

})(window);