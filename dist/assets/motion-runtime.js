(function (root) {
  'use strict';

  var CONNECT_END = 15 / 60;
  var TRAVEL_END = 35 / 60;
  var INSPECT_END = 50 / 60;
  var VERT = '#version 300 es\nin vec2 a_pos;\nin float a_size;\nin vec3 a_color;\nuniform vec2 u_res;\nout vec3 v_color;\nvoid main(){vec2 clip=(a_pos/u_res)*2.0-1.0;gl_Position=vec4(clip.x,-clip.y,0.0,1.0);gl_PointSize=a_size;v_color=a_color;}';
  var FRAG = '#version 300 es\nprecision mediump float;\nin vec3 v_color;\nout vec4 outColor;\nvoid main(){vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);if(d>1.0)discard;float glow=exp(-d*2.8);outColor=vec4(v_color,glow);}';

  var PRESETS = [
    { aliases: ['dhl'], motion_profile: 'road_logistics', scene_theme: 'dhl_amber', vehicle_type: 'delivery_van', route_type: 'city_route', particle_style: 'scan_pulse', accent: '#ffcc00' },
    { aliases: ['ups'], motion_profile: 'road_logistics', scene_theme: 'ups_branch', vehicle_type: 'delivery_van', route_type: 'branch_route', particle_style: 'data_packet', accent: '#64a70b' },
    { aliases: ['fedex'], motion_profile: 'air_cargo', scene_theme: 'fedex_purple', vehicle_type: 'aircraft', route_type: 'air_corridor', particle_style: 'document_chip', accent: '#4d148c' },
    { aliases: ['maersk'], motion_profile: 'ocean_vessel', scene_theme: 'maersk_blue', vehicle_type: 'container_ship', route_type: 'ocean_lane', particle_style: 'wake_packet', accent: '#42b0d5' },
    { aliases: ['alibaba', '알리바바'], motion_profile: 'commerce_catalog', scene_theme: 'alibaba_orange', vehicle_type: 'catalog_card', route_type: 'conveyor', particle_style: 'attribute_chip', accent: '#ff6a00' },
    { aliases: ['ebay', '이베이'], motion_profile: 'commerce_catalog', scene_theme: 'ebay_field', vehicle_type: 'catalog_card', route_type: 'field_match', particle_style: 'attribute_chip', accent: '#0064d2' },
    { aliases: ['cj', 'cj대한통운', '대한통운'], motion_profile: 'road_logistics', scene_theme: 'cj_red', vehicle_type: 'delivery_van', route_type: 'warehouse_scan', particle_style: 'scan_pulse', accent: '#c8102e' },
    { aliases: ['gxo'], motion_profile: 'warehouse_edge', scene_theme: 'gxo_grid', vehicle_type: 'pallet', route_type: 'warehouse_grid', particle_style: 'stock_cell', accent: '#0d9f76' }
  ];

  var PROFILE_FALLBACK = {
    road: 'road_logistics', road_logistics: 'road_logistics', scan: 'road_logistics', route: 'road_logistics',
    air: 'air_cargo', air_cargo: 'air_cargo', document: 'air_cargo',
    ocean: 'ocean_vessel', ocean_vessel: 'ocean_vessel',
    warehouse: 'warehouse_edge', warehouse_edge: 'warehouse_edge',
    catalog: 'commerce_catalog', commerce_catalog: 'commerce_catalog',
    satellite: 'satellite_network', satellite_network: 'satellite_network', default: 'satellite_network'
  };

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  function clampDpr(raw) {
    var value = Number(raw) || 1;
    return Math.min(1.5, Math.max(1, value));
  }

  function parseTime(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    var parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function hashSeed(value) {
    var text = String(value || 'putduk');
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function resolveProgress(input) {
    var started = parseTime(input.started_at || input.startedAt);
    var expected = parseTime(input.expected_completed_at || input.expectedCompletedAt);
    var now = Number(input.now || Date.now());
    if (started && expected && expected > started) return clamp01((now - started) / (expected - started));
    return clamp01(Number(input.progress || 0));
  }

  function resolvePhase(progress) {
    var value = clamp01(progress);
    if (value < CONNECT_END) return 'connect';
    if (value < TRAVEL_END) return 'travel';
    if (value < INSPECT_END) return 'inspect';
    return 'sync';
  }

  function phaseLocalProgress(progress) {
    var value = clamp01(progress);
    if (value < CONNECT_END) return value / CONNECT_END;
    if (value < TRAVEL_END) return (value - CONNECT_END) / (TRAVEL_END - CONNECT_END);
    if (value < INSPECT_END) return (value - TRAVEL_END) / (INSPECT_END - TRAVEL_END);
    return (value - INSPECT_END) / (1 - INSPECT_END);
  }

  function detectQuality(input) {
    if (input.reducedMotion || input.hidden) {
      return { level: 'static', dpr: 1, particleCount: 0, useWorker: false, useWebGL: false, targetFps: 1 };
    }
    var cores = Number(input.hardwareConcurrency || 4);
    var memory = Number(input.deviceMemory || 4);
    var saveData = input.saveData === true;
    var webgl2 = input.webgl2 !== false;
    if (saveData || cores <= 2 || memory <= 2) {
      return { level: 'low', dpr: 1, particleCount: 24, useWorker: true, useWebGL: webgl2, targetFps: 30 };
    }
    if (cores <= 6 || memory <= 4) {
      return { level: 'medium', dpr: 1.25, particleCount: 48, useWorker: true, useWebGL: webgl2, targetFps: 45 };
    }
    return { level: 'high', dpr: 1.5, particleCount: 96, useWorker: true, useWebGL: webgl2, targetFps: 60 };
  }

  function browserHints() {
    var nav = typeof navigator === 'undefined' ? null : navigator;
    var connection = nav && nav.connection;
    return {
      reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      hardwareConcurrency: Number(nav && nav.hardwareConcurrency || 4),
      deviceMemory: Number(nav && nav.deviceMemory || 4),
      saveData: !!(connection && connection.saveData),
      hidden: typeof document !== 'undefined' && document.hidden
    };
  }

  function resolveMotion(node) {
    var source = node || {};
    var haystack = [source.company, source.brand_name, source.partner_name, source.slug, source.name, source.title, source.title_ko]
      .map(function (value) { return String(value || '').toLowerCase().replace(/\s+/g, ''); });
    var matched = PRESETS.find(function (preset) {
      return preset.aliases.some(function (alias) {
        return haystack.some(function (text) { return text.indexOf(alias) !== -1; });
      });
    });
    var raw = String(source.motion_profile || source.motion || (matched && matched.motion_profile) || 'default');
    var profile = PROFILE_FALLBACK[raw] || (matched && matched.motion_profile) || 'satellite_network';
    var accents = {
      road_logistics: '#f3cd6b',
      air_cargo: '#b4aaff',
      ocean_vessel: '#78dce6',
      warehouse_edge: '#80efc1',
      commerce_catalog: '#f3cd6b',
      satellite_network: '#0d9f76'
    };
    return {
      motion_profile: profile,
      motion_version: String(source.motion_version || '2.0.0'),
      scene_theme: String(source.scene_theme || (matched && matched.scene_theme) || profile),
      vehicle_type: String(source.vehicle_type || (matched && matched.vehicle_type) || 'satellite'),
      route_type: String(source.route_type || (matched && matched.route_type) || 'uplink'),
      particle_style: String(source.particle_style || (matched && matched.particle_style) || 'data_packet'),
      completion_effect: String(source.completion_effect || 'gold_sync'),
      scene: profile,
      accent: String(source.color || (matched && matched.accent) || accents[profile] || '#0d9f76')
    };
  }

  function poseOnPath(points, t) {
    if (points.length < 2) return { x: 0, y: 0, angle: 0 };
    var scaled = Math.min(0.999, Math.max(0, t)) * (points.length - 1);
    var index = Math.floor(scaled);
    var local = scaled - index;
    var a = points[index];
    var b = points[index + 1];
    return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  function strokePath(ctx, points, color) {
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(function (point) { ctx.lineTo(point.x, point.y); });
    ctx.stroke();
  }

  function drawRoad(ctx, frame) {
    var w = frame.width;
    var h = frame.height;
    var points = frame.route === 'branch_route'
      ? [{ x: w * 0.08, y: h * 0.74 }, { x: w * 0.3, y: h * 0.58 }, { x: w * 0.48, y: h * 0.42 }, { x: w * 0.62, y: h * 0.56 }, { x: w * 0.88, y: h * 0.3 }]
      : frame.route === 'warehouse_scan'
        ? [{ x: w * 0.1, y: h * 0.68 }, { x: w * 0.28, y: h * 0.68 }, { x: w * 0.28, y: h * 0.38 }, { x: w * 0.72, y: h * 0.38 }, { x: w * 0.72, y: h * 0.64 }, { x: w * 0.9, y: h * 0.28 }]
        : [{ x: w * 0.08, y: h * 0.72 }, { x: w * 0.28, y: h * 0.58 }, { x: w * 0.48, y: h * 0.62 }, { x: w * 0.7, y: h * 0.4 }, { x: w * 0.9, y: h * 0.32 }];
    strokePath(ctx, points, 'rgba(243, 205, 107, 0.35)');
    if (frame.route === 'branch_route') {
      ctx.strokeStyle = 'rgba(100, 167, 11, 0.28)';
      ctx.beginPath();
      ctx.moveTo(points[2].x, points[2].y);
      ctx.lineTo(w * 0.86, h * 0.7);
      ctx.stroke();
    }
    var pose = poseOnPath(points, frame.phase === 'connect' ? frame.phaseLocal * 0.18 : frame.progress);
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.fillStyle = frame.color;
    ctx.fillRect(-14, -7, 28, 14);
    ctx.fillStyle = '#f3cd6b';
    ctx.fillRect(8, -4, 8, 8);
    ctx.restore();
  }

  function drawAir(ctx, frame) {
    var w = frame.width;
    var h = frame.height;
    var points = [{ x: w * 0.08, y: h * 0.7 }, { x: w * 0.32, y: h * 0.38 }, { x: w * 0.58, y: h * 0.28 }, { x: w * 0.92, y: h * 0.42 }];
    strokePath(ctx, points, 'rgba(180, 170, 255, 0.35)');
    var pose = poseOnPath(points, frame.phase === 'connect' ? frame.phaseLocal * 0.2 : frame.progress);
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.fillStyle = frame.color;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawOcean(ctx, frame) {
    var w = frame.width;
    var h = frame.height;
    var t = frame.progress;
    for (var i = 0; i < 6; i += 1) {
      var y = h * 0.42 + i * 18;
      ctx.strokeStyle = 'rgba(120, 220, 230,' + (0.08 + i * 0.03) + ')';
      ctx.beginPath();
      for (var x = 0; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x / 40 + t * 8 + i) * 6);
      ctx.stroke();
    }
    var shipX = w * (0.15 + t * 0.7);
    var shipY = h * 0.5 + Math.sin(t * 6) * 8;
    var nextX = w * (0.15 + Math.min(1, t + 0.02) * 0.7);
    var angle = Math.atan2(Math.sin((t + 0.02) * 6) * 8 - Math.sin(t * 6) * 8, nextX - shipX);
    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(angle);
    ctx.fillStyle = frame.color;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(32, -4);
    ctx.lineTo(20, 12);
    ctx.lineTo(-24, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWarehouse(ctx, frame) {
    var w = frame.width;
    var h = frame.height;
    var t = frame.progress;
    for (var row = 0; row < 4; row += 1) {
      for (var col = 0; col < 8; col += 1) {
        var x = w * 0.12 + col * (w * 0.1);
        var y = h * 0.28 + row * 38;
        var lit = ((col + row + Math.floor(t * 12)) % 4) === 0;
        ctx.strokeStyle = lit ? frame.color : 'rgba(255,255,255,0.16)';
        ctx.strokeRect(x, y, 28, 22);
      }
    }
  }

  function drawCatalog(ctx, frame) {
    var w = frame.width;
    var h = frame.height;
    var t = frame.progress;
    for (var i = 0; i < 5; i += 1) {
      var x = w * 0.18 + i * (w * 0.15);
      var y = h * 0.35 + Math.sin(t * 4 + i) * 10;
      ctx.fillStyle = i % 2 ? frame.color : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, 54, 72);
      ctx.fillStyle = '#f3cd6b';
      ctx.fillRect(x + 8, y + 10, 38, 8);
    }
  }

  function drawSatellite(ctx, frame) {
    var w = frame.width;
    var h = frame.height;
    var t = frame.progress;
    var hubs = [
      { x: w * 0.22, y: h * 0.62 },
      { x: w * 0.5, y: h * 0.7 },
      { x: w * 0.78, y: h * 0.58 },
      { x: w * 0.5, y: h * 0.22 }
    ];
    ctx.strokeStyle = 'rgba(13, 159, 118, 0.28)';
    hubs.forEach(function (hub, index) {
      var next = hubs[(index + 1) % hubs.length];
      ctx.beginPath();
      ctx.moveTo(hub.x, hub.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    });
    hubs.forEach(function (hub, index) {
      ctx.beginPath();
      ctx.fillStyle = index === 3 ? frame.color : '#80efc1';
      ctx.arc(hub.x, hub.y, 3 + ((t * 8 + index) % 1) * 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  var scenes = {
    road_logistics: drawRoad,
    air_cargo: drawAir,
    ocean_vessel: drawOcean,
    warehouse_edge: drawWarehouse,
    commerce_catalog: drawCatalog,
    satellite_network: drawSatellite
  };

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function buildProgram(gl) {
    var vert = compile(gl, gl.VERTEX_SHADER, VERT);
    var frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
  }

  function bindAttrib(gl, program, name, data, size, store) {
    var loc = gl.getAttribLocation(program, name);
    var buffer = gl.createBuffer();
    if (!buffer || loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    store.push(buffer);
  }

  function workerUrl() {
    var admin = typeof document !== 'undefined' && document.documentElement.dataset.mode === 'admin';
    return admin ? '../assets/motion.worker.js' : './assets/motion.worker.js';
  }

  function MotionEngine(canvas) {
    this.canvas = canvas;
    this.glCanvas = null;
    this.gl = null;
    this.program = null;
    this.buffers = [];
    this.lost = false;
    this.worker = null;
    this.packets = [];
    this.bitmap = null;
    this.visible = true;
    this.lastDraw = 0;
    this.quality = detectQuality(browserHints());
    this.observer = null;
    this.initGl();
    this.initWorker();
    this.initObserver();
  }

  MotionEngine.prototype.initObserver = function () {
    var self = this;
    if (typeof IntersectionObserver !== 'function') return;
    this.observer = new IntersectionObserver(function (entries) {
      self.visible = entries.some(function (entry) { return entry.isIntersecting; });
    }, { threshold: 0.05 });
    this.observer.observe(this.canvas);
  };

  MotionEngine.prototype.initWorker = function () {
    var self = this;
    if (!this.quality.useWorker || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(workerUrl());
      this.worker.onmessage = function (event) {
        self.packets = Array.isArray(event.data && event.data.packets) ? event.data.packets : [];
        if (self.bitmap && self.bitmap !== event.data.bitmap && self.bitmap.close) self.bitmap.close();
        self.bitmap = event.data && event.data.bitmap || null;
      };
      this.worker.onerror = function () {
        if (self.worker) self.worker.terminate();
        self.worker = null;
      };
    } catch (error) {
      this.worker = null;
    }
  };

  MotionEngine.prototype.initGl = function () {
    this.releaseGl();
    try {
      this.glCanvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(Math.max(2, this.canvas.width), Math.max(2, this.canvas.height))
        : document.createElement('canvas');
      var gl = this.glCanvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
      if (!gl) return;
      var self = this;
      if (this.glCanvas.addEventListener) {
        this.glCanvas.addEventListener('webglcontextlost', function (event) {
          event.preventDefault();
          self.lost = true;
        });
        this.glCanvas.addEventListener('webglcontextrestored', function () {
          self.lost = false;
          self.initGl();
        });
      }
      var program = buildProgram(gl);
      if (!program) return;
      this.gl = gl;
      this.program = program;
      this.lost = false;
    } catch (error) {
      this.gl = null;
    }
  };

  MotionEngine.prototype.releaseGl = function () {
    var gl = this.gl;
    var self = this;
    if (gl) {
      this.buffers.forEach(function (buffer) { gl.deleteBuffer(buffer); });
      if (this.program) gl.deleteProgram(this.program);
    }
    this.buffers = [];
    this.program = null;
    this.gl = null;
    this.glCanvas = null;
    void self;
  };

  MotionEngine.prototype.requestWorker = function (frame, profile) {
    if (!this.worker || frame.reduced || this.quality.particleCount <= 0) return;
    this.worker.postMessage({
      type: 'simulate',
      width: frame.width,
      height: frame.height,
      progress: frame.progress,
      seed: frame.seed,
      count: this.quality.particleCount,
      profile: profile,
      phase: frame.phase
    });
  };

  MotionEngine.prototype.drawWebgl = function (frame) {
    var gl = this.gl;
    var program = this.program;
    var target = this.glCanvas;
    if (!gl || !program || !target || !this.packets.length) return false;
    var width = Math.max(2, this.canvas.width);
    var height = Math.max(2, this.canvas.height);
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(program);
    var count = this.packets.length;
    var pos = new Float32Array(count * 2);
    var size = new Float32Array(count);
    var color = new Float32Array(count * 3);
    this.packets.forEach(function (packet, index) {
      pos[index * 2] = packet.x;
      pos[index * 2 + 1] = packet.y;
      size[index] = packet.size * 6;
      var gold = packet.color === '#f3cd6b';
      color[index * 3] = gold ? 0.95 : 0.5;
      color[index * 3 + 1] = gold ? 0.8 : 0.94;
      color[index * 3 + 2] = gold ? 0.42 : 0.76;
    });
    this.buffers.forEach(function (buffer) { gl.deleteBuffer(buffer); });
    this.buffers = [];
    bindAttrib(gl, program, 'a_pos', pos, 2, this.buffers);
    bindAttrib(gl, program, 'a_size', size, 1, this.buffers);
    bindAttrib(gl, program, 'a_color', color, 3, this.buffers);
    gl.uniform2f(gl.getUniformLocation(program, 'u_res'), frame.width, frame.height);
    gl.drawArrays(gl.POINTS, 0, count);
    return true;
  };

  MotionEngine.prototype.drawCanvas = function (frame, profile) {
    var ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    var dpr = this.canvas.width / Math.max(1, frame.width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame.width, frame.height);
    if (this.glCanvas && this.packets.length) ctx.drawImage(this.glCanvas, 0, 0, frame.width, frame.height);
    else if (this.bitmap) ctx.drawImage(this.bitmap, 0, 0, frame.width, frame.height);
    var draw = scenes[profile] || drawSatellite;
    draw(ctx, frame);
    if (frame.phase === 'sync') {
      ctx.fillStyle = 'rgba(243, 205, 107,' + (0.08 + frame.phaseLocal * 0.12) + ')';
      ctx.fillRect(0, 0, frame.width, frame.height);
    }
  };

  MotionEngine.prototype.frame = function (input) {
    var hints = browserHints();
    this.quality = detectQuality(hints);
    if (!this.visible || hints.hidden) return;
    var now = performance.now();
    var minDelta = 1000 / Math.max(1, this.quality.targetFps);
    if (now - this.lastDraw < minDelta && this.quality.level !== 'static') return;
    this.lastDraw = now;
    var rect = this.canvas.getBoundingClientRect();
    var dpr = clampDpr(window.devicePixelRatio || 1);
    var width = Math.max(1, Math.floor(rect.width * dpr));
    var height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    var descriptor = resolveMotion(input);
    var progress = resolveProgress(input);
    var frame = {
      width: rect.width,
      height: rect.height,
      progress: progress,
      phase: resolvePhase(progress),
      phaseLocal: phaseLocalProgress(progress),
      seed: hashSeed(input.motion_seed || input.motionSeed || descriptor.scene_theme),
      reduced: this.quality.level === 'static',
      color: descriptor.accent,
      theme: descriptor.scene_theme,
      vehicle: descriptor.vehicle_type,
      route: descriptor.route_type,
      particle: descriptor.particle_style,
      completion: descriptor.completion_effect
    };
    this.requestWorker(frame, descriptor.motion_profile);
    if (this.quality.useWebGL && !this.lost) this.drawWebgl(frame);
    this.drawCanvas(frame, descriptor.motion_profile);
  };

  MotionEngine.prototype.dispose = function () {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    if (this.bitmap && this.bitmap.close) this.bitmap.close();
    this.bitmap = null;
    this.releaseGl();
  };

  var engines = typeof WeakMap === 'function' ? new WeakMap() : null;
  var fallbackEngines = [];

  function engineFor(canvas) {
    if (engines) {
      var current = engines.get(canvas);
      if (!current) {
        current = new MotionEngine(canvas);
        engines.set(canvas, current);
      }
      return current;
    }
    var found = fallbackEngines.find(function (item) { return item.canvas === canvas; });
    if (!found) {
      found = new MotionEngine(canvas);
      fallbackEngines.push(found);
    }
    return found;
  }

  root.PutdukMotion = {
    resolve: resolveMotion,
    detectQuality: detectQuality,
    tick: function (canvas, input) {
      if (!canvas) return;
      engineFor(canvas).frame(input || {});
    },
    release: function (canvas) {
      if (!canvas) return;
      if (engines && engines.has(canvas)) {
        engines.get(canvas).dispose();
        engines.delete(canvas);
        return;
      }
      fallbackEngines = fallbackEngines.filter(function (item) {
        if (item.canvas !== canvas) return true;
        item.dispose();
        return false;
      });
    }
  };
})(window);
