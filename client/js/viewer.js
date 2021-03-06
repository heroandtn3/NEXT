'use strict';

const MapSize = require('./map-size');
const PIXI = require('pixi.js');
const AnimatedValue = require('./animated-value');
const BallView = require('./ball-view');
const Misc = require('./misc');
const Stats = require('stats.js');
const EventEmitter = require('events').EventEmitter;

class Viewer extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;

    this.balls = {};
    this.reSort = false;
    this.addRenderer();
    this.addStats();
    this.mapSize = MapSize.default();
    client.once('connected', () => {
      this.zoom = 0;
      this.initStage();
      this.addListners();
      this.animate();
      this.homeview = true;
      client.once('myNewBall', () => this.homeview = false);
      this.emit('launched');
    });
    client.on('mapSizeLoad', (minX, minY, maxX, maxY) => {
      const mapSize = new MapSize(minX, minY, maxX, maxY);
      if (mapSize.isLegit()) {
        this.mapSize = mapSize;
        this.updateBorders();
      }
    });
    client.on('spectateFieldUpdate', (x, y, zoom) => {
      this.cam.x.set(x, 120);
      this.cam.y.set(y, 120);
    });
    window.addEventListener('resize', () => this.updateSize());
    window.addEventListener('wheel', e => this.modifyZoom(e.deltaY));
  }

  getSize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  addRenderer() {
    this.getSize();
    this.renderer = PIXI.autoDetectRenderer(this.width, this.height, {
      antialias: true,
      backgroundColor: 0x111111,
    });
    document.getElementById('viewer').appendChild(this.renderer.view);
  }

  updateSize() {
    this.getSize();
    this.renderer.resize(this.width, this.height);
  }

  defaultScale() {
    return Math.max(this.width / 1920, this.height / 1080);
  }

  modifyZoom(amount) {
    this.zoom -= Math.sign(amount) * 0.15;
    this.zoom = Misc.ensureRange(this.zoom, -5, 1.5);
  }

  initStage() {
    this.stage = new PIXI.Container();
    this.cam = {
      x: new AnimatedValue(this.mapSize.centerX()),
      y: new AnimatedValue(this.mapSize.centerY()),
      s: new AnimatedValue(this.defaultScale()),
      z: new AnimatedValue(this.zoom),
    };
  }

  addListners() {
    this.client.on('ballAppear', id => {
      if (!this.balls[id]) {
        this.balls[id] = new BallView(this, this.client.balls[id]);
      }
    });
    this.client.on('ballDestroy', id => delete this.client.balls[id]);
  }

  updateBorders() {
    if (!this.borders) {
      this.borders = new PIXI.Graphics();
      this.borders.zIndex = -1;
      this.stage.addChild(this.borders);
    }
    this.borders.clear();
    this.borders.lineStyle(5, 0xFF3300, 1);
    const s = this.mapSize;
    this.borders.drawRect(s.minX, s.minY, s.width(), s.height());
  }

  addStats() {
    this.stats = new Stats();
    this.stats.setMode(1);
    this.stats.domElement.style.position = 'absolute';
    this.stats.domElement.style.left = '0px';
    this.stats.domElement.style.top = '0px';
    document.body.appendChild(this.stats.domElement);
  }

  zSort() {
    this.stage.children.sort(
      (a, b) => a.zIndex === b.zIndex ? a.ballId - b.ballId : a.zIndex - b.zIndex);
  }

  posCamera() {
    let sumX, sumY, sumSize;
    sumX = sumY = sumSize = 0;
    let myBallIds = this.client.my_balls;
    let balls = this.client.balls;
    let visibleBallCount = 0;
    for (let i = myBallIds.length - 1; i >= 0; --i) {
      const ball = balls[myBallIds[i]];
      if (!ball.visible) continue;

      sumX += ball.x;
      sumY += ball.y;
      sumSize += ball.size;
      visibleBallCount += 1;
    }

    if (sumSize > 0) { // if we have visible ball(s)
      this.cam.x.set(sumX / visibleBallCount, 120);
      this.cam.y.set(sumY / visibleBallCount, 120);
      this.cam.s.set(Math.pow(Math.min(64 / sumSize, 1), 0.4) * this.defaultScale(), 500);
    } else if (this.homeview) {
      this.cam.s.write(this.defaultScale());
    } // else: don't move the camera
    this.cam.z.set(this.zoom, 120);
  }

  render() {
    let ballIds = Object.keys(this.client.balls);
    for (let i = ballIds.length - 1; i >= 0; --i) {
      let ballView = this.balls[ballIds[i]];
      if (ballView) {
        ballView.render();
      }
    }
  }

  animate() {
    this.stats.begin();
    if (this.reSort) this.zSort();
    this.render();
    this.posCamera();
    this.stage.scale.x = this.stage.scale.y =
      this.cam.s.get() * Math.pow(2, this.cam.z.get());
    this.stage.position.x = -this.cam.x.get() * this.stage.scale.x + this.width / 2;
    this.stage.position.y = -this.cam.y.get() * this.stage.scale.y + this.height / 2;
    this.renderer.render(this.stage);
    this.stats.end();
    this.emit('animate');
    requestAnimationFrame(() => this.animate());
  }
}

module.exports = Viewer;
