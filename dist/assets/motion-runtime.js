(() => {
  // src/motion/motion-quality.ts
  function clampDpr(raw) {
    const value = Number(raw) || 1;
    return Math.min(1.5, Math.max(1, value));
  }
  function detectQuality(input = {}) {
    if (input.reducedMotion || input.hidden) {
      return {
        level: "static",
        dpr: 1,
        particleCount: 0,
        useWorker: false,
        useWebGL: false,
        targetFps: 1
      };
    }
    const cores = Number(input.hardwareConcurrency || 4);
    const memory = Number(input.deviceMemory || 4);
    const saveData = input.saveData === true;
    const webgl2 = input.webgl2 !== false;
    if (saveData || cores <= 2 || memory <= 2) {
      return {
        level: "low",
        dpr: 1,
        particleCount: 24,
        useWorker: true,
        useWebGL: webgl2,
        targetFps: 30
      };
    }
    if (cores <= 6 || memory <= 4) {
      return {
        level: "medium",
        dpr: 1.25,
        particleCount: 48,
        useWorker: true,
        useWebGL: webgl2,
        targetFps: 45
      };
    }
    return {
      level: "high",
      dpr: 1.5,
      particleCount: 96,
      useWorker: true,
      useWebGL: webgl2,
      targetFps: 60
    };
  }
  function readBrowserQualityHints() {
    const nav = typeof navigator === "undefined" ? void 0 : navigator;
    const connection = nav && "connection" in nav ? nav.connection : void 0;
    return {
      reducedMotion: typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false,
      hardwareConcurrency: Number(nav?.hardwareConcurrency || 4),
      deviceMemory: Number(nav?.deviceMemory || 4),
      saveData: connection?.saveData === true,
      hidden: typeof document !== "undefined" ? document.hidden : false
    };
  }

  // src/motion/motion-registry.ts
  var PRESETS = [
    {
      aliases: ["dhl"],
      motion_profile: "road_logistics",
      motion_version: "2.0.0",
      scene_theme: "dhl_amber",
      vehicle_type: "delivery_van",
      route_type: "city_route",
      particle_style: "scan_pulse",
      completion_effect: "gold_sync",
      scene: "road_logistics",
      accent: "#ffcc00"
    },
    {
      aliases: ["ups"],
      motion_profile: "road_logistics",
      motion_version: "2.0.0",
      scene_theme: "ups_branch",
      vehicle_type: "delivery_van",
      route_type: "branch_route",
      particle_style: "data_packet",
      completion_effect: "gold_sync",
      scene: "road_logistics",
      accent: "#64a70b"
    },
    {
      aliases: ["fedex"],
      motion_profile: "air_cargo",
      motion_version: "2.0.0",
      scene_theme: "fedex_purple",
      vehicle_type: "aircraft",
      route_type: "air_corridor",
      particle_style: "document_chip",
      completion_effect: "gold_sync",
      scene: "air_cargo",
      accent: "#4d148c"
    },
    {
      aliases: ["maersk"],
      motion_profile: "ocean_vessel",
      motion_version: "2.0.0",
      scene_theme: "maersk_blue",
      vehicle_type: "container_ship",
      route_type: "ocean_lane",
      particle_style: "wake_packet",
      completion_effect: "gold_sync",
      scene: "ocean_vessel",
      accent: "#42b0d5"
    },
    {
      aliases: ["alibaba", "\uC54C\uB9AC\uBC14\uBC14"],
      motion_profile: "commerce_catalog",
      motion_version: "2.0.0",
      scene_theme: "alibaba_orange",
      vehicle_type: "catalog_card",
      route_type: "conveyor",
      particle_style: "attribute_chip",
      completion_effect: "gold_sync",
      scene: "commerce_catalog",
      accent: "#ff6a00"
    },
    {
      aliases: ["ebay", "\uC774\uBCA0\uC774"],
      motion_profile: "commerce_catalog",
      motion_version: "2.0.0",
      scene_theme: "ebay_field",
      vehicle_type: "catalog_card",
      route_type: "field_match",
      particle_style: "attribute_chip",
      completion_effect: "gold_sync",
      scene: "commerce_catalog",
      accent: "#0064d2"
    },
    {
      aliases: ["cj", "cj\uB300\uD55C\uD1B5\uC6B4", "\uB300\uD55C\uD1B5\uC6B4"],
      motion_profile: "road_logistics",
      motion_version: "2.0.0",
      scene_theme: "cj_red",
      vehicle_type: "delivery_van",
      route_type: "warehouse_scan",
      particle_style: "scan_pulse",
      completion_effect: "gold_sync",
      scene: "road_logistics",
      accent: "#c8102e"
    },
    {
      aliases: ["gxo"],
      motion_profile: "warehouse_edge",
      motion_version: "2.0.0",
      scene_theme: "gxo_grid",
      vehicle_type: "pallet",
      route_type: "warehouse_grid",
      particle_style: "stock_cell",
      completion_effect: "gold_sync",
      scene: "warehouse_edge",
      accent: "#0d9f76"
    }
  ];
  var PROFILE_FALLBACK = {
    road: "road_logistics",
    road_logistics: "road_logistics",
    scan: "road_logistics",
    route: "road_logistics",
    air: "air_cargo",
    air_cargo: "air_cargo",
    document: "air_cargo",
    ocean: "ocean_vessel",
    ocean_vessel: "ocean_vessel",
    warehouse: "warehouse_edge",
    warehouse_edge: "warehouse_edge",
    catalog: "commerce_catalog",
    commerce_catalog: "commerce_catalog",
    satellite: "satellite_network",
    satellite_network: "satellite_network",
    default: "satellite_network"
  };
  var PROFILE_DEFAULTS = {
    road_logistics: {
      motion_version: "2.0.0",
      scene_theme: "city_amber",
      vehicle_type: "delivery_van",
      route_type: "city_route",
      particle_style: "data_packet",
      completion_effect: "gold_sync",
      accent: "#f3cd6b"
    },
    air_cargo: {
      motion_version: "2.0.0",
      scene_theme: "air_violet",
      vehicle_type: "aircraft",
      route_type: "air_corridor",
      particle_style: "document_chip",
      completion_effect: "gold_sync",
      accent: "#b4aaff"
    },
    ocean_vessel: {
      motion_version: "2.0.0",
      scene_theme: "ocean_teal",
      vehicle_type: "container_ship",
      route_type: "ocean_lane",
      particle_style: "wake_packet",
      completion_effect: "gold_sync",
      accent: "#78dce6"
    },
    warehouse_edge: {
      motion_version: "2.0.0",
      scene_theme: "grid_mint",
      vehicle_type: "pallet",
      route_type: "warehouse_grid",
      particle_style: "stock_cell",
      completion_effect: "gold_sync",
      accent: "#80efc1"
    },
    commerce_catalog: {
      motion_version: "2.0.0",
      scene_theme: "catalog_gold",
      vehicle_type: "catalog_card",
      route_type: "conveyor",
      particle_style: "attribute_chip",
      completion_effect: "gold_sync",
      accent: "#f3cd6b"
    },
    satellite_network: {
      motion_version: "2.0.0",
      scene_theme: "sat_mint",
      vehicle_type: "satellite",
      route_type: "uplink",
      particle_style: "data_packet",
      completion_effect: "gold_sync",
      accent: "#0d9f76"
    }
  };
  function resolveMotion(node) {
    const source = node || {};
    const haystack = [
      source.company,
      source.brand_name,
      source.partner_name,
      source.slug,
      source.name,
      source.title,
      source.title_ko
    ].map((value) => String(value || "").toLowerCase().replace(/\s+/g, ""));
    const matched = PRESETS.find(
      (preset) => preset.aliases.some((alias) => haystack.some((text) => text.includes(alias)))
    );
    const rawProfile = String(source.motion_profile || source.motion || matched?.motion_profile || "default");
    const profile = PROFILE_FALLBACK[rawProfile] || matched?.motion_profile || "satellite_network";
    const defaults = PROFILE_DEFAULTS[profile];
    return {
      motion_profile: profile,
      motion_version: String(source.motion_version || matched?.motion_version || defaults.motion_version),
      scene_theme: String(source.scene_theme || matched?.scene_theme || defaults.scene_theme),
      vehicle_type: String(source.vehicle_type || matched?.vehicle_type || defaults.vehicle_type),
      route_type: String(source.route_type || matched?.route_type || defaults.route_type),
      particle_style: String(source.particle_style || matched?.particle_style || defaults.particle_style),
      completion_effect: String(source.completion_effect || matched?.completion_effect || defaults.completion_effect),
      scene: profile,
      accent: String(source.color || matched?.accent || defaults.accent)
    };
  }

  // src/motion/motion-timeline.ts
  var CONNECT_END = 15 / 60;
  var TRAVEL_END = 35 / 60;
  var INSPECT_END = 50 / 60;
  function resolveProgress(input) {
    const started = parseTime(input.started_at);
    const expected = parseTime(input.expected_completed_at);
    const now = Number(input.now || Date.now());
    if (started && expected && expected > started) {
      return clamp01((now - started) / (expected - started));
    }
    return clamp01(Number(input.progress || 0));
  }
  function resolvePhase(progress) {
    const value = clamp01(progress);
    if (value < CONNECT_END) return "connect";
    if (value < TRAVEL_END) return "travel";
    if (value < INSPECT_END) return "inspect";
    return "sync";
  }
  function phaseLocalProgress(progress) {
    const value = clamp01(progress);
    if (value < CONNECT_END) return value / CONNECT_END;
    if (value < TRAVEL_END) return (value - CONNECT_END) / (TRAVEL_END - CONNECT_END);
    if (value < INSPECT_END) return (value - TRAVEL_END) / (INSPECT_END - TRAVEL_END);
    return (value - INSPECT_END) / (1 - INSPECT_END);
  }
  function hashSeed(value) {
    const text = String(value || "putduk");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function parseTime(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  // src/motion/cinematic-draw.ts
  function clockOf(frame) {
    return (frame.clock || 0) + frame.progress * 2.4 + frame.workLocal * 1.8 + frame.seed % 97 * 0.01;
  }
  function travelOf(frame) {
    if (frame.workCut === "lock") return 0.22 + frame.workLocal * 0.18;
    if (frame.workCut === "submit") return 0.18 + frame.workLocal * 0.7;
    if (frame.workCut === "approve") return 0.62 + frame.workLocal * 0.22;
    return frame.phase === "connect" ? frame.phaseLocal * 0.2 : clamp012(frame.progress);
  }
  function fillSky(ctx, w, h, horizon, kind) {
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    if (kind === "ocean") {
      g.addColorStop(0, "#071525");
      g.addColorStop(0.52, "#16344a");
      g.addColorStop(1, "#c4784a");
    } else if (kind === "runway") {
      g.addColorStop(0, "#081018");
      g.addColorStop(0.45, "#152536");
      g.addColorStop(1, "#3a4a5a");
    } else if (kind === "night") {
      g.addColorStop(0, "#050a10");
      g.addColorStop(1, "#12202a");
    } else {
      g.addColorStop(0, "#0b1c28");
      g.addColorStop(0.5, "#1a3a4a");
      g.addColorStop(1, "#c4784a");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, Math.max(1, horizon));
  }
  function drawSun(ctx, x, y, r) {
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
    glow.addColorStop(0, "rgba(243,205,107,0.85)");
    glow.addColorStop(0.35, "rgba(243,205,107,0.22)");
    glow.addColorStop(1, "rgba(243,205,107,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3cd6b";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawHills(ctx, w, horizon, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.quadraticCurveTo(w * 0.18, horizon - 28, w * 0.34, horizon - 10);
    ctx.quadraticCurveTo(w * 0.52, horizon - 36, w * 0.7, horizon - 8);
    ctx.quadraticCurveTo(w * 0.86, horizon - 24, w, horizon - 6);
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
  }
  function drawCitySilhouette(ctx, w, horizon, t) {
    ctx.fillStyle = "#0a1418";
    for (let i = 0; i < 18; i += 1) {
      const x = w / 18 * i + 4;
      const bw = 10 + i % 3 * 6;
      const bh = 16 + i * 17 % 42;
      ctx.fillRect(x, horizon - bh, bw, bh);
      if ((i + Math.floor(t * 6)) % 3 === 0) {
        ctx.fillStyle = "rgba(243,205,107,0.35)";
        ctx.fillRect(x + 3, horizon - bh + 6, 3, 4);
        ctx.fillStyle = "#0a1418";
      }
    }
  }
  function drawWheel(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#121416";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a3f45";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(rot);
    ctx.strokeStyle = "rgba(220,224,228,0.55)";
    ctx.lineWidth = Math.max(1, r * 0.1);
    for (let i = 0; i < 5; i += 1) {
      ctx.rotate(Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(r * 0.12, 0);
      ctx.lineTo(r * 0.52, 0);
      ctx.stroke();
    }
    ctx.fillStyle = "#cfd3d7";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function bodyPath(ctx, d) {
    const path = new Path2D(d);
    ctx.fill(path);
  }
  function drawRoadWheel(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.72);
    drawWheel(ctx, 0, 0, r, rot);
    ctx.restore();
  }
  function fillTrapezoid(ctx, topW, botW, topY, botY, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-topW, topY);
    ctx.lineTo(topW, topY);
    ctx.lineTo(botW, botY);
    ctx.lineTo(-botW, botY);
    ctx.closePath();
    ctx.fill();
  }
  function drawSedanRoad(ctx, x, y, scale, color, clock, heading) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 24, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const rot = clock * 9;
    if (heading === "away") {
      fillTrapezoid(ctx, 14, 24, -28, 2, shade(color, 0.78));
      fillTrapezoid(ctx, 12, 18, -26, -8, "rgba(90,150,180,0.92)");
      fillTrapezoid(ctx, 8, 10, -26, -12, "rgba(234,247,255,0.4)");
      ctx.fillStyle = "#ff5a4a";
      ctx.fillRect(-20, -4, 8, 5);
      ctx.fillRect(12, -4, 8, 5);
      ctx.fillStyle = shade(color, 1.12);
      ctx.fillRect(-10, -6, 20, 3);
    } else {
      fillTrapezoid(ctx, 13, 24, -30, 2, shade(color, 0.92));
      fillTrapezoid(ctx, 11, 17, -28, -8, "rgba(154,212,234,0.95)");
      fillTrapezoid(ctx, 7, 9, -28, -14, "rgba(234,247,255,0.5)");
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(-22, -2, 9, 5);
      ctx.fillRect(13, -2, 9, 5);
      ctx.fillStyle = "#1a1c1e";
      ctx.fillRect(-8, 0, 16, 4);
      ctx.fillStyle = "rgba(255,224,140,0.28)";
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(-36, 16);
      ctx.lineTo(-12, 16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(36, 16);
      ctx.lineTo(12, 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#11161b";
    ctx.fillRect(-22, 2, 44, 6);
    drawRoadWheel(ctx, -16, 10, 7.5, rot);
    drawRoadWheel(ctx, 16, 10, 7.5, rot);
    ctx.restore();
  }
  function drawVanRoad(ctx, x, y, scale, color, clock, heading) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.beginPath();
    ctx.ellipse(0, 12, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    fillTrapezoid(ctx, 16, 26, heading === "away" ? -42 : -38, 2, color);
    fillTrapezoid(ctx, 16, 22, heading === "away" ? -42 : -38, -30, shade(color, 1.14));
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, heading === "away" ? -40 : -36);
    ctx.lineTo(0, 2);
    ctx.stroke();
    if (heading === "away") {
      ctx.fillStyle = "rgba(126,200,232,0.28)";
      ctx.fillRect(-14, -34, 12, 18);
      ctx.fillRect(2, -34, 12, 18);
      ctx.fillStyle = "#ff5a4a";
      ctx.fillRect(-22, -2, 8, 5);
      ctx.fillRect(14, -2, 8, 5);
    } else {
      ctx.fillStyle = "rgba(154,212,234,0.85)";
      fillTrapezoid(ctx, 10, 14, -36, -18, "rgba(154,212,234,0.85)");
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(-24, 0, 9, 5);
      ctx.fillRect(15, 0, 9, 5);
    }
    ctx.fillStyle = "#11161b";
    ctx.fillRect(-24, 2, 48, 6);
    const rot = clock * 8.2;
    drawRoadWheel(ctx, -16, 11, 8, rot);
    drawRoadWheel(ctx, 16, 11, 8, rot);
    ctx.restore();
  }
  function drawTruckRoad(ctx, x, y, scale, color, clock, heading) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,0.36)";
    ctx.beginPath();
    ctx.ellipse(0, 14, 30, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (heading === "away") {
      fillTrapezoid(ctx, 14, 20, -56, -40, "#1c242c");
      ctx.fillStyle = "#f3cd6b";
      ctx.fillRect(-8, -58, 16, 6);
      ctx.fillRect(-16, -54, 6, 6);
      ctx.fillRect(10, -54, 6, 6);
      fillTrapezoid(ctx, 18, 28, -40, 2, color);
      fillTrapezoid(ctx, 18, 24, -40, -32, shade(color, 1.18));
      ctx.strokeStyle = shade(color, 0.5);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(0, 2);
      ctx.stroke();
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-16, -30 + i * 8);
        ctx.lineTo(16, -30 + i * 8);
        ctx.stroke();
      }
      ctx.fillStyle = "#ff5a4a";
      ctx.fillRect(-24, -4, 10, 6);
      ctx.fillRect(14, -4, 10, 6);
    } else {
      fillTrapezoid(ctx, 16, 26, -36, 2, "#1c242c");
      fillTrapezoid(ctx, 12, 18, -34, -12, "rgba(126,200,232,0.9)");
      fillTrapezoid(ctx, 18, 28, -12, 4, color);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(-26, -2, 10, 6);
      ctx.fillRect(16, -2, 10, 6);
      ctx.fillStyle = "rgba(255,224,140,0.22)";
      ctx.beginPath();
      ctx.moveTo(-26, 2);
      ctx.lineTo(-48, 22);
      ctx.lineTo(-8, 22);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(26, 2);
      ctx.lineTo(48, 22);
      ctx.lineTo(8, 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#11161b";
    ctx.fillRect(-26, 4, 52, 7);
    const rot = clock * 7.4;
    drawRoadWheel(ctx, -18, 13, 9, rot);
    drawRoadWheel(ctx, 18, 13, 9, rot);
    ctx.restore();
  }
  function drawPlane(ctx, x, y, scale, angle, color, gear) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 46, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c5ccd6";
    bodyPath(ctx, "M-28 -18 L22 -6 L18 4 L-22 8 Z");
    ctx.fillStyle = shade("#c5ccd6", 0.82);
    bodyPath(ctx, "M-28 18 L22 6 L18 -2 L-22 -6 Z");
    ctx.fillStyle = "#d8dee6";
    bodyPath(ctx, "M-52 0 C-36 -10 -8 -12 28 -6 C48 -2 62 4 70 8 C48 14 10 16 -28 10 C-46 6 -54 4 -52 0 Z");
    ctx.fillStyle = color;
    roundPoly(ctx, -8, -5, 48, 10, 4);
    ctx.fillStyle = "#9aa3b0";
    bodyPath(ctx, "M-52 0 C-46 -6 -40 -8 -32 -8 V8 C-42 6 -50 4 -52 0 Z");
    ctx.fillStyle = "#d8dee6";
    bodyPath(ctx, "M52 -2 L76 -22 L76 -10 L62 6 Z");
    bodyPath(ctx, "M52 4 L72 20 L72 10 L60 6 Z");
    ctx.fillStyle = "#c5ccd6";
    bodyPath(ctx, "M-8 -16 L48 -4 L42 2 L-14 6 Z");
    ctx.fillStyle = shade("#c5ccd6", 0.82);
    bodyPath(ctx, "M-8 16 L48 4 L42 -2 L-14 -6 Z");
    ctx.fillStyle = "#7ec8e8";
    ctx.beginPath();
    ctx.ellipse(-6, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(6, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(18, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(-54, -3, 8, 5);
    if (gear > 0.05) {
      ctx.globalAlpha = gear;
      ctx.fillStyle = "#2a3138";
      ctx.fillRect(-8, 8, 2.4, 12);
      ctx.fillRect(12, 8, 2.4, 12);
      ctx.fillStyle = "#1a1c1e";
      ctx.beginPath();
      ctx.arc(-7, 21, 3.2, 0, Math.PI * 2);
      ctx.arc(13, 21, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawShip(ctx, x, y, scale, angle, color, clock) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(6,32,40,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 22, 62, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b2430";
    bodyPath(ctx, "M-70 6 C-50 22 -10 28 8 28 C40 28 70 22 78 8 L70 6 H-62 Z");
    ctx.fillStyle = color;
    bodyPath(ctx, "M-62 6 H66 C72 -2 76 -10 78 -14 H-50 C-58 -6 -62 0 -62 6 Z");
    const boxes = ["#c0392b", "#f3cd6b", "#2ecc71", "#3498db", "#8e44ad", "#e67e22"];
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        ctx.fillStyle = boxes[(col + row * 2) % boxes.length];
        ctx.fillRect(-48 + col * 16, -28 + row * 11, 15, 10);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(-48 + col * 16, -28 + row * 11, 15, 2);
      }
    }
    ctx.fillStyle = "#ecf0f1";
    ctx.fillRect(48, -32, 14, 26);
    ctx.fillStyle = "#bdc3c7";
    ctx.fillRect(51, -42, 8, 10);
    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(53, -50, 4, 8);
    ctx.strokeStyle = "rgba(214,243,255,0.4)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-66, 10);
    for (let i = 0; i < 8; i += 1) {
      ctx.lineTo(-50 + i * 16, 10 + Math.sin(clock * 3 + i) * 1.4);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawForklift(ctx, x, y, scale, color, clock) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    roundPoly(ctx, -18, -14, 28, 20, 3);
    ctx.fillStyle = "#1c242c";
    ctx.fillRect(-8, -18, 12, 8);
    ctx.fillStyle = "#cfd3d7";
    ctx.fillRect(10, -6, 22, 2);
    ctx.fillRect(10, 2, 22, 2);
    drawWheel(ctx, -12, 10, 6, clock * 6);
    drawWheel(ctx, 8, 10, 6, clock * 6);
    ctx.restore();
  }
  function roadLayout(w, h) {
    return {
      horizon: h * 0.34,
      vpX: w * 0.5,
      nearHalf: w * 0.5,
      farHalf: w * 0.04
    };
  }
  function roadPose(w, h, uRaw, lane) {
    const { horizon, vpX, nearHalf, farHalf } = roadLayout(w, h);
    const u = clamp012(uRaw);
    const y = horizon + (h - horizon - 8) * u;
    const hw = farHalf + (nearHalf - farHalf) * u;
    return {
      x: vpX + lane * hw * 0.42,
      y,
      scale: 0.16 + 0.92 * u,
      u
    };
  }
  function roadEdge(w, h, u, side) {
    const { horizon, vpX, nearHalf, farHalf } = roadLayout(w, h);
    const y = horizon + (h - horizon) * clamp012(u);
    const hw = farHalf + (nearHalf - farHalf) * clamp012(u);
    return { x: vpX + side * hw, y };
  }
  function strokeRoadLine(ctx, w, h, lane, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= 18; i += 1) {
      const pose = roadPose(w, h, i / 18, lane);
      if (i === 0) ctx.moveTo(pose.x, pose.y);
      else ctx.lineTo(pose.x, pose.y);
    }
    ctx.stroke();
  }
  function drawPerspectiveRoad(ctx, frame) {
    const { width: w, height: h } = frame;
    const { horizon, vpX, nearHalf, farHalf } = roadLayout(w, h);
    const t = clockOf(frame);
    fillSky(ctx, w, h, horizon, "dusk");
    drawSun(ctx, w * 0.78, horizon - 28, 16);
    drawHills(ctx, w, horizon, "#132018");
    drawCitySilhouette(ctx, w, horizon, t);
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, "#243028");
    ground.addColorStop(1, "#0c1410");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.beginPath();
    ctx.moveTo(vpX - farHalf, horizon + 1);
    ctx.lineTo(vpX + farHalf, horizon + 1);
    ctx.lineTo(vpX + nearHalf, h);
    ctx.lineTo(vpX - nearHalf, h);
    ctx.closePath();
    const road = ctx.createLinearGradient(0, horizon, 0, h);
    road.addColorStop(0, "#4a4e54");
    road.addColorStop(0.45, "#2a2d32");
    road.addColorStop(1, "#14161a");
    ctx.fillStyle = road;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(vpX - farHalf * 1.28, horizon);
    ctx.lineTo(vpX - farHalf, horizon);
    ctx.lineTo(vpX - nearHalf, h);
    ctx.lineTo(vpX - nearHalf * 1.08, h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(vpX + farHalf, horizon);
    ctx.lineTo(vpX + farHalf * 1.28, horizon);
    ctx.lineTo(vpX + nearHalf * 1.08, h);
    ctx.lineTo(vpX + nearHalf, h);
    ctx.fill();
    strokeRoadLine(ctx, w, h, -1.02, "rgba(232,232,234,0.78)", 2.2);
    strokeRoadLine(ctx, w, h, 1.02, "rgba(232,232,234,0.78)", 2.2);
    strokeRoadLine(ctx, w, h, -0.08, "rgba(240,220,140,0.85)", 1.6);
    strokeRoadLine(ctx, w, h, 0.08, "rgba(240,220,140,0.85)", 1.6);
    const travel = t * 1.85 % 1;
    const dashLanes = [-0.52, 0.52];
    dashLanes.forEach((lane) => {
      for (let i = 0; i < 18; i += 1) {
        const u = (i / 18 + travel) % 1;
        const a = roadPose(w, h, u, lane);
        const b = roadPose(w, h, Math.min(1, u + 0.028), lane);
        ctx.strokeStyle = `rgba(236,236,238,${0.18 + 0.7 * u})`;
        ctx.lineWidth = 1.2 + 2.4 * u;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    for (let i = 0; i < 14; i += 1) {
      const u = (i / 14 + travel * 0.5) % 1;
      const left = roadEdge(w, h, u, -1);
      const right = roadEdge(w, h, u, 1);
      ctx.fillStyle = i % 2 ? "#fff7d6" : "#f3cd6b";
      ctx.beginPath();
      ctx.arc(left.x, left.y, 1.2 + 2.2 * u, 0, Math.PI * 2);
      ctx.arc(right.x, right.y, 1.2 + 2.2 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawLoadingDock(ctx, frame) {
    const { width: w, height: h, color, workLocal: t } = frame;
    const x = w * 0.78;
    const y = h * 0.08;
    const bw = w * 0.2;
    const bh = h * 0.26;
    ctx.fillStyle = "#1a2228";
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x + bw * 0.22, y);
    ctx.lineTo(x + bw, y + 8);
    ctx.lineTo(x + bw, y + bh);
    ctx.lineTo(x, y + bh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x + bw * 0.22, y);
    ctx.lineTo(x + bw, y + 8);
    ctx.lineTo(x + bw * 0.78, y + 18);
    ctx.closePath();
    ctx.fill();
    const open = 10 + t * 28;
    ctx.fillStyle = "#0b1014";
    ctx.fillRect(x + 14, y + 28, 36, open);
    ctx.fillStyle = "rgba(243,205,107,0.22)";
    ctx.fillRect(x + 14, y + 28, 36, 6);
  }
  function drawOceanWorld(ctx, frame) {
    const { width: w, height: h } = frame;
    const horizon = h * 0.4;
    const t = clockOf(frame);
    fillSky(ctx, w, h, horizon, "ocean");
    drawSun(ctx, w * 0.8, horizon - 22, 14);
    drawHills(ctx, w, horizon, "rgba(18,40,36,0.85)");
    const sea = ctx.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, "#1a5a6e");
    sea.addColorStop(0.45, "#0d3a48");
    sea.addColorStop(1, "#062028");
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, w, h - horizon);
    const bounce = ctx.createLinearGradient(0, horizon, 0, horizon + 40);
    bounce.addColorStop(0, "rgba(243,205,107,0.28)");
    bounce.addColorStop(1, "rgba(243,205,107,0)");
    ctx.fillStyle = bounce;
    ctx.fillRect(w * 0.72, horizon, w * 0.16, 36);
    ctx.strokeStyle = "rgba(214,243,255,0.22)";
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 10; i += 1) {
      const y = horizon + 8 + i * ((h - horizon) / 11);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, y + Math.sin(x / 24 + t * 2.4 + i * 0.55) * (2.4 + i * 0.85));
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(214,243,255,0.08)";
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 0.11 + t * 0.08) % 1 * w;
      const y = horizon + 18 + i * 37 % (h - horizon - 24);
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + i % 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(8,20,24,0.55)";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
  }
  function drawRunwayWorld(ctx, frame) {
    const { width: w, height: h } = frame;
    const horizon = h * 0.32;
    const t = clockOf(frame);
    fillSky(ctx, w, h, horizon, "runway");
    drawHills(ctx, w, horizon, "#101820");
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, "#1a2a22");
    ground.addColorStop(1, "#0a1210");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);
    const vpX = w * 0.5;
    const far = w * 0.05;
    const near = w * 0.46;
    ctx.beginPath();
    ctx.moveTo(vpX - far, horizon + 2);
    ctx.lineTo(vpX + far, horizon + 2);
    ctx.lineTo(vpX + near, h);
    ctx.lineTo(vpX - near, h);
    ctx.closePath();
    ctx.fillStyle = "#2a2d32";
    ctx.fill();
    ctx.strokeStyle = "rgba(232,232,234,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpX - far * 0.7, horizon + 4);
    ctx.lineTo(vpX - near * 0.86, h);
    ctx.moveTo(vpX + far * 0.7, horizon + 4);
    ctx.lineTo(vpX + near * 0.86, h);
    ctx.stroke();
    const travel = t * 1.4 % 1;
    for (let i = 0; i < 14; i += 1) {
      const u = (i / 14 + travel) % 1;
      const y = horizon + (h - horizon) * u;
      const dashW = 2 + 8 * u;
      const dashH = 4 + 18 * u;
      ctx.fillStyle = `rgba(243,205,107,${0.25 + 0.6 * u})`;
      ctx.fillRect(vpX - dashW / 2, y, dashW, dashH);
    }
    for (let i = 0; i < 10; i += 1) {
      const u = 0.2 + i * 0.08;
      const left = roadPose(w, h, u, -1.05);
      const right = roadPose(w, h, u, 1.05);
      ctx.fillStyle = i % 2 ? "#fff" : "#f3cd6b";
      ctx.beginPath();
      ctx.arc(left.x, left.y, 1.6 + 2.4 * u, 0, Math.PI * 2);
      ctx.arc(right.x, right.y, 1.6 + 2.4 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawCruiseSky(ctx, frame) {
    const { width: w, height: h } = frame;
    const t = clockOf(frame);
    fillSky(ctx, w, h, h * 0.72, "runway");
    const earth = ctx.createLinearGradient(0, h * 0.62, 0, h);
    earth.addColorStop(0, "rgba(18, 48, 58, 0.0)");
    earth.addColorStop(0.28, "#16384a");
    earth.addColorStop(1, "#0b1c24");
    ctx.fillStyle = earth;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.5, h * 0.58, w, h * 0.72);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      const x = (i * 0.23 + t * 0.04) % 1.2 * w - w * 0.1;
      const y = h * (0.16 + i % 3 * 0.1);
      ctx.fillStyle = "rgba(220,228,236,0.18)";
      ctx.beginPath();
      ctx.ellipse(x, y, 52 + i * 10, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 28, y + 4, 38, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawWarehouseWorld(ctx, frame) {
    const { width: w, height: h, color } = frame;
    const t = clockOf(frame);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#101820");
    g.addColorStop(1, "#070c10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#151c22";
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    for (let i = 0; i < 7; i += 1) {
      const x = w * (0.08 + i * 0.13);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x, h * 0.12, 8, h * 0.6);
      for (let r = 0; r < 4; r += 1) {
        const y = h * (0.18 + r * 0.13);
        const lit = (i + r + Math.floor(t * 5)) % 3 === 0;
        ctx.fillStyle = lit ? hexAlpha(color, 0.55) : "rgba(255,255,255,0.08)";
        ctx.fillRect(x - 18, y, 44, 22);
        ctx.fillStyle = lit ? "#f3cd6b" : "rgba(0,0,0,0.25)";
        ctx.fillRect(x - 14, y + 4, 12, 8);
        ctx.fillRect(x + 2, y + 4, 12, 8);
      }
    }
    ctx.fillStyle = "rgba(243,205,107,0.08)";
    ctx.fillRect(0, h * 0.08, w, 6);
  }
  function drawCatalogWorld(ctx, frame) {
    const { width: w, height: h, color } = frame;
    const t = clockOf(frame);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#16120c");
    g.addColorStop(1, "#0a0c10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2a2e34";
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.78);
    ctx.lineTo(w * 0.96, h * 0.7);
    ctx.lineTo(w * 0.96, h * 0.86);
    ctx.lineTo(w * 0.04, h * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(243,205,107,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.8);
    ctx.lineTo(w * 0.94, h * 0.72);
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) {
      const u = (i / 5 + t * 0.08) % 1;
      const x = w * (0.1 + u * 0.72);
      const y = h * (0.34 + Math.sin(t + i) * 0.02);
      const s = 0.7 + u * 0.45;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = i % 2 ? color : "#1c242c";
      roundPoly(ctx, -28, -40, 56, 72, 6);
      ctx.fillStyle = "#f3cd6b";
      ctx.fillRect(-18, -28, 36, 6);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(-18, -12, 36, 28);
      ctx.restore();
    }
  }
  function drawGlobeWorld(ctx, frame) {
    const { width: w, height: h, color } = frame;
    const t = clockOf(frame);
    fillSky(ctx, w, h, h, "night");
    const cx = w * 0.5;
    const cy = h * 0.56;
    const r = Math.min(w, h) * 0.32;
    const globe = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    globe.addColorStop(0, "#1b5c68");
    globe.addColorStop(1, "#062028");
    ctx.fillStyle = globe;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = hexAlpha(color, 0.55);
    ctx.lineWidth = 1.3;
    const coasts = [
      "M118 86l28-22 36 6 22 24-8 28-34 16-30-8-18-22z",
      "M214 64l52-16 48 10 36 28-6 36-28 22-54 8-44-18-16-32z",
      "M352 78l70-18 64 8 48 26-10 42-36 24-72 10-58-14-18-34z",
      "M548 70l86 8 48 22 18 34-28 28-62 12-70-10-22-30z",
      "M236 210l46 4 28 22 8 36-24 28-40 6-32-16-10-34z",
      "M538 214l64 2 36 18 10 34-22 26-48 8-46-14-12-28z"
    ];
    ctx.translate(cx - r, cy - r * 0.55);
    ctx.scale(r * 2 / 800, r * 1.4 / 400);
    coasts.forEach((d) => ctx.stroke(new Path2D(d)));
    ctx.restore();
    ctx.strokeStyle = "rgba(128,239,193,0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const ang = t * 0.7;
    const sx = cx + Math.cos(ang) * r * 1.18;
    const sy = cy + Math.sin(ang) * r * 0.42;
    ctx.strokeStyle = "rgba(243,205,107,0.45)";
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.2);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.fillStyle = "#d8dee6";
    ctx.beginPath();
    ctx.rect(sx - 8, sy - 3, 16, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(sx - 18, sy - 2, 10, 4);
    ctx.fillRect(sx + 8, sy - 2, 10, 4);
  }
  function drawIdBadge(ctx, x, y, bw, bh, color, bandY, band, tilt) {
    ctx.save();
    ctx.translate(x + bw / 2, y + bh / 2);
    ctx.rotate(tilt);
    ctx.translate(-bw / 2, -bh / 2);
    roundPoly(ctx, 0, 0, bw, bh, Math.max(6, bw * 0.06), "#243444");
    ctx.strokeStyle = "rgba(243,205,107,0.7)";
    ctx.lineWidth = Math.max(1.5, bw * 0.012);
    ctx.stroke();
    ctx.fillStyle = band;
    ctx.fillRect(0, Math.max(0, Math.min(bh - bh * 0.12, bandY)), bw, bh * 0.12);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, bw, Math.max(6, bh * 0.08));
    ctx.fillStyle = "rgba(128,239,193,0.9)";
    ctx.beginPath();
    ctx.arc(bw * 0.22, bh * 0.42, Math.max(7, bw * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(243,205,107,0.9)";
    ctx.fillRect(bw * 0.42, bh * 0.34, bw * 0.42, Math.max(4, bh * 0.06));
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(bw * 0.42, bh * 0.46, bw * 0.36, Math.max(3, bh * 0.04));
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(bw * 0.42, bh * 0.56, bw * 0.28, Math.max(3, bh * 0.03));
    ctx.restore();
  }
  function drawPhoneShell(ctx, x, y, pw, ph) {
    roundPoly(ctx, x, y, pw, ph, 18, "#101820");
    roundPoly(ctx, x + 8, y + 16, pw - 16, ph - 32, 10, "#18222c");
    const cols = 3;
    const rows = 4;
    const cell = Math.min((pw - 28) / cols, (ph - 70) / rows);
    let slot = { x: x + 14, y: y + 36 };
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const ix = x + 14 + col * (cell + 6);
        const iy = y + 36 + row * (cell + 8);
        if (col === 1 && row === 1) slot = { x: ix, y: iy };
        else roundPoly(ctx, ix, iy, cell, cell, 8, "rgba(255,255,255,0.08)");
      }
    }
    return { slotX: slot.x, slotY: slot.y, cell };
  }
  function hexAlpha(hex, alpha) {
    const { r, g, b } = rgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function shade(hex, factor) {
    const { r, g, b } = rgb(hex);
    return `rgb(${clampByte(r * factor)}, ${clampByte(g * factor)}, ${clampByte(b * factor)})`;
  }
  function mixHex(a, b, t) {
    const left = rgb(a);
    const right = rgb(b);
    const u = clamp012(t);
    return `rgb(${Math.round(left.r + (right.r - left.r) * u)}, ${Math.round(left.g + (right.g - left.g) * u)}, ${Math.round(left.b + (right.b - left.b) * u)})`;
  }
  function roundPoly(ctx, x, y, w, h, r, fill) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    } else {
      ctx.fill();
    }
  }
  function rgb(hex) {
    const raw = String(hex || "#80efc1").replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw.padEnd(6, "0").slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16) || 0,
      g: parseInt(full.slice(2, 4), 16) || 0,
      b: parseInt(full.slice(4, 6), 16) || 0
    };
  }
  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
  function clamp012(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  // src/motion/work-phase.ts
  var WORK_PHASES = {
    lock: "lock",
    submit: "submit",
    approve: "approve",
    pwa_home: "pwa_home",
    demote: "demote"
  };
  var PHASE_ALIASES = {
    start: "lock",
    lock: "lock",
    lock_in: "lock",
    work_start: "lock",
    begin: "lock",
    submit: "submit",
    route: "submit",
    correct_path: "submit",
    path: "submit",
    approve: "approve",
    approval: "approve",
    settle: "approve",
    payout: "approve",
    credit: "approve",
    pwa_home: "pwa_home",
    pwa: "pwa_home",
    onboarding_pwa: "pwa_home",
    badge_home: "pwa_home",
    home_badge: "pwa_home",
    demote: "demote",
    principal_withdraw: "demote",
    badge_down: "demote",
    rank_down: "demote",
    stripe_down: "demote"
  };
  function normalizeWorkPhase(phase) {
    const key = String(phase || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    return PHASE_ALIASES[key] || null;
  }
  function defaultWorkDuration(cut) {
    if (cut === "approve") return 1200;
    if (cut === "pwa_home") return 1000;
    if (cut === "demote") return 1100;
    if (cut === "submit") return 900;
    return 900;
  }
  function workCutProgress(cut, local) {
    const t = clamp013(local);
    if (cut === "lock") return t * 0.22;
    if (cut === "submit") return 0.26 + t * 0.32;
    if (cut === "approve") return 0.84 + t * 0.16;
    if (cut === "pwa_home") return 0.48 + t * 0.22;
    return 0.18 + (1 - t) * 0.16;
  }
  function easeWork(t) {
    const x = clamp013(t);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
  function partnerToInput(partner) {
    if (partner && typeof partner === "object") {
      return { ...partner };
    }
    const name = String(partner || "").trim();
    return {
      company: name,
      partner_name: name,
      slug: name,
      name,
      title: name
    };
  }
  function readWorkCut(input) {
    const source = input || {};
    return normalizeWorkPhase(source.work_cut || source.workCut || source.work_phase || source.workPhase);
  }
  function readWorkLocal(input) {
    const source = input || {};
    const raw = source.work_local ?? source.workLocal;
    if (raw == null || raw === "") return 0;
    return clamp013(Number(raw));
  }
  function readPrincipal(input) {
    const source = input || {};
    return finiteMoney(source.principal ?? source.lock_amount ?? source.lockAmount);
  }
  function readStipend(input) {
    const source = input || {};
    return finiteMoney(source.stipend ?? source.allowance ?? source.pay);
  }
  function applyWorkCamera(ctx, frame) {
    const cut = frame.workCut;
    if (!cut || frame.reduced) return;
    const w = frame.width;
    const h = frame.height;
    const t = easeWork(frame.workLocal);
    const zoom = cut === "lock" ? 1.06 + t * 0.14 : cut === "submit" ? 1.05 + t * 0.12 : cut === "demote" ? 1.08 + t * 0.1 : 1.04 + t * 0.06;
    const panX = cut === "submit" ? w * 0.05 * Math.sin(t * Math.PI) : cut === "lock" ? -w * 0.02 * t : 0;
    const panY = cut === "lock" ? -h * 0.06 * t : cut === "demote" ? h * 0.06 * t : 0;
    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);
  }
  function drawWorkCinematic(ctx, frame) {
    if (!frame.workCut) return;
    if (frame.workCut === "lock") drawLockCut(ctx, frame);
    else if (frame.workCut === "submit") drawSubmitCut(ctx, frame);
    else if (frame.workCut === "approve") drawApproveCut(ctx, frame);
    else if (frame.workCut === "pwa_home") drawPwaHomeCut(ctx, frame);
    else drawDemoteCut(ctx, frame);
  }
  function buildWorkTickInput(partner, phase, extras, local) {
    const cut = normalizeWorkPhase(phase);
    const payload = partnerToInput(partner);
    const principal = finiteMoney(extras?.principal ?? extras?.lock_amount);
    const stipend = finiteMoney(extras?.stipend ?? extras?.allowance);
    return {
      ...payload,
      progress: cut ? workCutProgress(cut, local) : 0,
      work_cut: cut,
      work_local: easeWork(local),
      principal,
      stipend,
      motion_seed: extras?.motion_seed ?? payload.motion_seed
    };
  }
  function drawLockCut(ctx, frame) {
    const { width: w, height: h, workLocal: t } = frame;
    const dockX = w * 0.84;
    const dockY = h * 0.28;
    for (let i = 0; i < 5; i += 1) {
      const delay = i * 0.1;
      const u = easeWork(clamp013((t - delay) / 0.55));
      const sx = w * (0.72 + i % 3 * 0.05);
      const sy = h * (0.18 + i * 0.05);
      drawBox3d(
        ctx,
        sx + (dockX - 28 - sx) * u,
        sy + (dockY - sy) * u,
        16 - u * 3,
        10 - u * 2,
        5 + (1 - u) * 6,
        i % 2 ? "#f3cd6b" : "#e7c56a"
      );
    }
  }
  function drawSubmitCut(ctx, frame) {
    const { width: w, height: h, workLocal: t } = frame;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(243,205,107,0)");
    g.addColorStop(0.5, `rgba(243,205,107,${0.08 + t * 0.12})`);
    g.addColorStop(1, "rgba(243,205,107,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.42, w, h * 0.18);
  }
  function drawApproveCut(ctx, frame) {
    const { width: w, height: h, workLocal: t, principal, stipend } = frame;
    const inset = Math.max(22, Math.min(w, h) * 0.07);
    ctx.fillStyle = `rgba(243,205,107,${0.05 + t * 0.08})`;
    ctx.fillRect(0, 0, w, h);
    const trayY = h - inset - h * 0.12;
    drawBox3d(ctx, inset, trayY, w - inset * 2, h * 0.1, 10, "#1c2a36");
    ctx.fillStyle = "rgba(128,239,193,0.28)";
    ctx.fillRect(inset + 8, trayY + 6, (w - inset * 2 - 16) * t, 7);
    const slabH = Math.max(28, Math.min(40, h * 0.12));
    const slabW = (w - inset * 3) / 2;
    drawValueSlab(ctx, inset, inset, slabW, slabH, principal, "#80efc1", 0.95);
    drawValueSlab(ctx, inset * 2 + slabW, inset, slabW, slabH, stipend, "#f3cd6b", 0.95);
  }
  function drawPwaHomeCut(ctx, frame) {
    const { width: w, height: h, workLocal: t, color } = frame;
    ctx.fillStyle = `rgba(4,10,14,${0.35 + t * 0.2})`;
    ctx.fillRect(0, 0, w, h);
    const phoneW = Math.min(w * 0.36, 158);
    const phoneH = Math.min(h * 0.82, phoneW * 2.05);
    const phoneX = w * 0.56;
    const phoneY = (h - phoneH) / 2;
    const slot = drawPhoneShell(ctx, phoneX, phoneY, phoneW, phoneH);
    const start = { x: Math.max(18, w * 0.07), y: Math.max(18, h * 0.1), bw: w * 0.38, bh: h * 0.64 };
    const bw = start.bw + (slot.cell - start.bw) * t;
    const bh = start.bh + (slot.cell - start.bh) * t;
    const x = start.x + (slot.slotX - start.x) * t;
    const y = start.y + (slot.slotY - start.y) * t;
    ctx.save();
    ctx.shadowColor = "rgba(243,205,107,0.45)";
    ctx.shadowBlur = 18 * (1 - t);
    drawIdBadge(ctx, x, y, bw, bh, "#243442", 0.12 * bh, color, (1 - t) * 0.08);
    ctx.restore();
  }
  function drawDemoteCut(ctx, frame) {
    const { width: w, height: h, workLocal: t, color } = frame;
    ctx.fillStyle = `rgba(4,10,14,${0.1 + t * 0.18})`;
    ctx.fillRect(0, 0, w, h);
    const gate = t * w * 0.18;
    ctx.fillStyle = "rgba(12,18,22,0.42)";
    ctx.fillRect(0, 0, gate, h);
    ctx.fillRect(w - gate, 0, gate, h);
    const bw = w * 0.34;
    const bh = h * 0.48;
    const x = (w - bw) / 2;
    const y = Math.max(18, h * 0.16) + t * h * 0.22;
    drawIdBadge(ctx, x, y, bw, bh, "#1a2430", (0.08 + t * 0.7) * bh, mixHex(color, "#6b7280", t), 0.06 * t);
  }
  function drawValueSlab(ctx, x, y, w, h, amount, color, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, alpha);
    roundPoly(ctx, x, y, w, h, 8, hexAlpha(color, 0.2));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (amount > 0) {
      ctx.fillStyle = color;
      ctx.font = `600 ${Math.max(13, h * 0.4)}px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(amount).toLocaleString("ko-KR"), x + w / 2, y + h / 2);
    }
    ctx.restore();
  }
  function drawBox3d(ctx, x, y, w, h, depth, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = shade(color, 0.72);
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + depth, y - depth * 0.6);
    ctx.lineTo(x + w + depth, y + h - depth * 0.6);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(color, 1.12);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + depth, y - depth * 0.6);
    ctx.lineTo(x + w + depth, y - depth * 0.6);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
  }
  function finiteMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  function clamp013(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  // src/motion/scenes/road-logistics.scene.ts
  function wrapUnit(value) {
    return (value % 1 + 1) % 1;
  }
  function drawScene(ctx, frame) {
    const clock = clockOf(frame);
    const travel = travelOf(frame);
    drawPerspectiveRoad(ctx, frame);
    if (frame.workCut === "lock") drawLoadingDock(ctx, frame);
    const heroLane = 0.38;
    const heroU = frame.workCut === "lock" ? 0.58 + frame.workLocal * 0.14 : frame.workCut === "submit" ? 0.46 + frame.workLocal * 0.22 : 0.68;
    const actors = [
      {
        u: heroU,
        lane: heroLane,
        kind: "truck",
        heading: "away",
        tint: frame.color
      },
      {
        u: 0.12 + wrapUnit(travel * 0.45) * 0.16,
        lane: 0.78,
        kind: "van",
        heading: "away",
        tint: shadePartner(frame.color)
      },
      {
        u: wrapUnit(0.18 + travel * 0.72),
        lane: -0.4,
        kind: "sedan",
        heading: "toward",
        tint: "#9aacb8"
      },
      {
        u: wrapUnit(0.52 + travel * 0.5),
        lane: -0.78,
        kind: "van",
        heading: "toward",
        tint: "#d8dee6"
      }
    ];
    actors.filter((car) => {
      if (car.kind === "truck" && car.lane === heroLane) return true;
      const nearHero = Math.abs(car.u - heroU) < 0.16 && Math.abs(car.lane - heroLane) < 0.55;
      return !nearHero && car.u > 0.07 && car.u < 0.88;
    }).sort((a, b) => a.u - b.u).forEach((car) => {
      const pose = roadPose(frame.width, frame.height, car.u, car.lane);
      const scale = pose.scale * (car.kind === "truck" ? 1.05 : car.kind === "van" ? 0.92 : 0.78);
      if (car.kind === "truck") drawTruckRoad(ctx, pose.x, pose.y, scale, car.tint, clock, car.heading);
      else if (car.kind === "van") drawVanRoad(ctx, pose.x, pose.y, scale, car.tint, clock, car.heading);
      else drawSedanRoad(ctx, pose.x, pose.y, scale, car.tint, clock, car.heading);
    });
  }
  function shadePartner(hex) {
    const raw = String(hex || "#0d9f76").replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw.padEnd(6, "0").slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16) || 13;
    const g = parseInt(full.slice(2, 4), 16) || 159;
    const b = parseInt(full.slice(4, 6), 16) || 118;
    const mix = (c) => Math.max(0, Math.min(255, Math.round(c * 0.72 + 40)));
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }

  // src/motion/scenes/air-cargo.scene.ts
  function drawScene2(ctx, frame) {
    const travel = travelOf(frame);
    const clock = clockOf(frame);
    const cruise = frame.workCut === "approve" || frame.phase === "sync" && !frame.workCut;
    if (cruise) {
      drawCruiseSky(ctx, frame);
      const x = frame.width * (0.2 + travel * 0.52);
      const y = frame.height * (0.4 + Math.sin(clock) * 0.028);
      drawPlane(ctx, x, y, 1.22, -0.14, frame.color, 0);
      ctx.strokeStyle = "rgba(220,228,236,0.32)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 86, y + 10);
      ctx.quadraticCurveTo(x - 160, y + 22, x - 240, y + 8);
      ctx.stroke();
      drawPlane(
        ctx,
        frame.width * 0.78,
        frame.height * 0.22,
        0.38,
        -0.08,
        "#c5ccd4",
        0
      );
      return;
    }
    drawRunwayWorld(ctx, frame);
    const gear = frame.workCut === "lock" ? 1 : Math.max(0, 1 - travel * 1.35);
    const pose = roadPose(frame.width, frame.height, 0.2 + travel * 0.64, 0);
    const climb = frame.workCut === "submit" ? -0.22 * frame.workLocal : frame.workCut === "lock" ? 0 : -0.06;
    drawPlane(ctx, pose.x, pose.y + climb * 90, pose.scale * 1.12, climb, frame.color, gear);
  }

  // src/motion/scenes/ocean-vessel.scene.ts
  function drawScene3(ctx, frame) {
    const { width: w, height: h } = frame;
    const t = travelOf(frame);
    const clock = clockOf(frame);
    drawOceanWorld(ctx, frame);
    const farX = w * (0.62 + Math.sin(clock * 0.35) * 0.04);
    const farY = h * 0.46 + Math.sin(clock * 0.9) * 3;
    drawShip(ctx, farX, farY, Math.min(w, h) / 520, Math.sin(clock * 0.9) * 0.03, "#c5d0d6", clock * 0.8);
    const x = w * (0.16 + t * 0.56);
    const y = h * 0.6 + Math.sin(clock * 1.4) * 7;
    const angle = Math.sin(clock * 1.4) * 0.045;
    const scale = Math.min(w, h) / 200;
    drawShip(ctx, x, y, scale, angle, frame.color, clock);
    ctx.strokeStyle = "rgba(214,243,255,0.34)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - 78 * scale, y + 20 * scale);
    for (let i = 1; i <= 12; i += 1) {
      ctx.lineTo(
        x - 78 * scale - i * 16,
        y + 20 * scale + Math.sin(clock * 3.2 + i) * (3.5 + i * 0.35)
      );
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(214,243,255,0.12)";
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.ellipse(
        x - 50 * scale - i * 18,
        y + 22 * scale + Math.sin(clock * 4 + i) * 2,
        10 + i,
        2.4,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  // src/motion/scenes/warehouse-edge.scene.ts
  function drawScene4(ctx, frame) {
    const { width: w, height: h, color } = frame;
    const t = travelOf(frame);
    const clock = clockOf(frame);
    drawWarehouseWorld(ctx, frame);
    const x = w * (0.14 + t * 0.62);
    const y = h * 0.78;
    const scale = Math.min(w, h) / 82;
    drawForklift(ctx, x, y, scale, color, clock);
    ctx.fillStyle = "#f3cd6b";
    ctx.fillRect(x + 16 * scale, y - 28 * scale + Math.sin(clock * 2) * 3, 22 * scale, 14 * scale);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 16 * scale, y - 28 * scale + Math.sin(clock * 2) * 3, 22 * scale, 3);
  }

  // src/motion/scenes/commerce-catalog.scene.ts
  function drawScene5(ctx, frame) {
    drawCatalogWorld(ctx, frame);
  }

  // src/motion/scenes/satellite-network.scene.ts
  function drawScene6(ctx, frame) {
    drawGlobeWorld(ctx, frame);
  }

  // src/motion/motion-engine.ts
  var VERT = `#version 300 es
in vec2 a_pos;
in float a_size;
in vec3 a_color;
uniform vec2 u_res;
out vec3 v_color;
void main() {
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;
  var FRAG = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float glow = exp(-d * 2.8);
  outColor = vec4(v_color, glow);
}`;
  var scenes = {
    road_logistics: drawScene,
    air_cargo: drawScene2,
    ocean_vessel: drawScene3,
    warehouse_edge: drawScene4,
    commerce_catalog: drawScene5,
    satellite_network: drawScene6
  };
  var MotionEngine = class {
    canvas;
    glCanvas = null;
    gl = null;
    program = null;
    buffers = [];
    lost = false;
    worker = null;
    packets = [];
    bitmap = null;
    observer = null;
    visible = true;
    lastDraw = 0;
    lastRect = { width: 0, height: 0, ts: 0 };
    lastQualityKey = "";
    quality;
    constructor(canvas, workerUrl) {
      this.canvas = canvas;
      this.quality = this.refreshQuality();
      this.bindContextEvents();
      this.initGl();
      this.initWorker(workerUrl);
      this.initObserver();
    }
    frame(input) {
      const hints = readBrowserQualityHints();
      const qualityKey = `${hints.hidden ? 1 : 0}:${hints.saveData ? 1 : 0}:${hints.reducedMotion ? 1 : 0}:${this.lost ? 1 : 0}`;
      if (qualityKey !== this.lastQualityKey) {
        this.quality = this.refreshQuality();
        this.lastQualityKey = qualityKey;
      }
      const workCut = readWorkCut(input);
      if (hints.hidden || !this.visible) return;
      const now = performance.now();
      const minDelta = 1e3 / Math.max(1, this.quality.targetFps);
      if (now - this.lastDraw < minDelta && this.quality.level !== "static" && !workCut) return;
      this.lastDraw = now;
      const rect = now - this.lastRect.ts < 250 && this.lastRect.width ? this.lastRect : (() => {
        const box = this.canvas.getBoundingClientRect();
        this.lastRect = { width: box.width, height: box.height, ts: now };
        return this.lastRect;
      })();
      const dpr = clampDpr(this.quality.dpr * (typeof devicePixelRatio === "number" ? Math.min(devicePixelRatio, 1.5) / (devicePixelRatio || 1) : 1) * (devicePixelRatio || 1));
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      const descriptor = resolveMotion(input);
      const progress = resolveProgress(input);
      const frame = {
        width: rect.width,
        height: rect.height,
        progress,
        phase: resolvePhase(progress),
        phaseLocal: phaseLocalProgress(progress),
        seed: hashSeed(input.motion_seed || input.motionSeed || descriptor.scene_theme),
        reduced: this.quality.level === "static",
        color: descriptor.accent,
        theme: descriptor.scene_theme,
        vehicle: descriptor.vehicle_type,
        route: descriptor.route_type,
        particle: descriptor.particle_style,
        completion: descriptor.completion_effect,
        workCut,
        workLocal: readWorkLocal(input),
        principal: readPrincipal(input),
        stipend: readStipend(input),
        clock: (typeof performance !== "undefined" ? performance.now() : 0) / 1e3
      };
      this.requestWorker(frame, descriptor.motion_profile);
      if (this.quality.useWebGL && !this.lost) this.drawWebgl(frame);
      this.drawCanvas(frame, descriptor.motion_profile);
    }
    dispose() {
      this.observer?.disconnect();
      this.observer = null;
      this.worker?.terminate();
      this.worker = null;
      this.bitmap?.close?.();
      this.bitmap = null;
      this.releaseGl();
    }
    refreshQuality() {
      const hints = readBrowserQualityHints();
      return detectQuality({
        ...hints,
        webgl2: !this.lost && !!this.canvas.getContext
      });
    }
    bindContextEvents() {
      this.canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.lost = true;
        this.releaseGl();
      });
      this.canvas.addEventListener("webglcontextrestored", () => {
        this.lost = false;
        this.initGl();
      });
    }
    initObserver() {
      if (typeof IntersectionObserver !== "function") return;
      this.observer = new IntersectionObserver((entries) => {
        this.visible = entries.some((entry) => entry.isIntersecting);
      }, { threshold: 0.05 });
      this.observer.observe(this.canvas);
    }
    initWorker(workerUrl) {
      if (!this.quality.useWorker || typeof Worker === "undefined") return;
      const url = workerUrl || resolveWorkerUrl();
      try {
        this.worker = new Worker(url);
        this.worker.onmessage = (event) => {
          this.packets = Array.isArray(event.data?.packets) ? event.data.packets : [];
          if (this.bitmap && this.bitmap !== event.data?.bitmap) this.bitmap.close?.();
          this.bitmap = event.data?.bitmap || null;
        };
        this.worker.onerror = () => {
          this.worker?.terminate();
          this.worker = null;
        };
      } catch {
        this.worker = null;
      }
    }
    requestWorker(frame, profile) {
      if (!this.worker || frame.reduced || this.quality.particleCount <= 0) return;
      this.worker.postMessage({
        type: "simulate",
        width: frame.width,
        height: frame.height,
        progress: frame.progress,
        seed: frame.seed,
        count: this.quality.particleCount,
        profile,
        phase: frame.phase,
        workCut: frame.workCut,
        workLocal: frame.workLocal
      });
    }
    initGl() {
      this.releaseGl();
      try {
        this.glCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(Math.max(2, this.canvas.width), Math.max(2, this.canvas.height)) : document.createElement("canvas");
        const gl = this.glCanvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          premultipliedAlpha: true
        });
        if (!gl) return;
        this.glCanvas.addEventListener?.("webglcontextlost", (event) => {
          event.preventDefault();
          this.lost = true;
        });
        this.glCanvas.addEventListener?.("webglcontextrestored", () => {
          this.lost = false;
          this.initGl();
        });
        const program = buildProgram(gl, VERT, FRAG);
        if (!program) return;
        this.gl = gl;
        this.program = program;
        this.lost = false;
      } catch {
        this.gl = null;
      }
    }
    releaseGl() {
      const gl = this.gl;
      if (gl) {
        this.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
        if (this.program) gl.deleteProgram(this.program);
      }
      this.buffers = [];
      this.program = null;
      this.gl = null;
      this.glCanvas = null;
    }
    drawWebgl(frame) {
      const gl = this.gl;
      const program = this.program;
      const target = this.glCanvas;
      if (!gl || !program || !target || this.packets.length === 0) return false;
      const width = Math.max(2, this.canvas.width);
      const height = Math.max(2, this.canvas.height);
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
      const count = this.packets.length;
      const pos = new Float32Array(count * 2);
      const size = new Float32Array(count);
      const color = new Float32Array(count * 3);
      this.packets.forEach((packet, index) => {
        pos[index * 2] = packet.x;
        pos[index * 2 + 1] = packet.y;
        size[index] = packet.size * 6;
        const gold = packet.color === "#f3cd6b";
        color[index * 3] = gold ? 0.95 : 0.5;
        color[index * 3 + 1] = gold ? 0.8 : 0.94;
        color[index * 3 + 2] = gold ? 0.42 : 0.76;
      });
      bindAttrib(gl, program, "a_pos", pos, 2, this.buffers, 0);
      bindAttrib(gl, program, "a_size", size, 1, this.buffers, 1);
      bindAttrib(gl, program, "a_color", color, 3, this.buffers, 2);
      gl.uniform2f(gl.getUniformLocation(program, "u_res"), frame.width, frame.height);
      gl.drawArrays(gl.POINTS, 0, count);
      return true;
    }
    drawCanvas(frame, profile) {
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      const dpr = this.canvas.width / Math.max(1, frame.width);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, frame.width, frame.height);
      if (this.glCanvas && this.packets.length) ctx.drawImage(this.glCanvas, 0, 0, frame.width, frame.height);
      else if (this.bitmap) ctx.drawImage(this.bitmap, 0, 0, frame.width, frame.height);
      ctx.save();
      applyWorkCamera(ctx, frame);
      scenes[profile](ctx, frame);
      if (frame.workCut === "lock" || frame.workCut === "submit") {
        drawWorkCinematic(ctx, frame);
      }
      ctx.restore();
      if (frame.workCut === "approve" || frame.workCut === "pwa_home" || frame.workCut === "demote") {
        drawWorkCinematic(ctx, frame);
      }
      if (frame.phase === "sync" && frame.completion === "gold_sync" && !frame.workCut) {
        ctx.fillStyle = `rgba(243, 205, 107, ${0.08 + frame.phaseLocal * 0.12})`;
        ctx.fillRect(0, 0, frame.width, frame.height);
      }
    }
  };
  function resolveWorkerUrl() {
    const admin = typeof document !== "undefined" && document.documentElement.dataset.mode === "admin";
    return admin ? "../assets/motion.worker.js" : "./assets/motion.worker.js";
  }
  function buildProgram(gl, vertSrc, fragSrc) {
    const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    return program;
  }
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  function bindAttrib(gl, program, name, data, size, store, index = 0) {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0) return;
    let buffer = store[index];
    if (!buffer) {
      buffer = gl.createBuffer();
      if (!buffer) return;
      store[index] = buffer;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function createMotionEngine(canvas, workerUrl) {
    return new MotionEngine(canvas, workerUrl);
  }

  // src/motion/browser-api.ts
  var engines = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
  var fallbackEngines = [];
  var workLoops = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
  var fallbackLoops = [];
  var lastCanvas = null;
  var visibilityBound = false;
  function bindVisibilityStop() {
    if (visibilityBound || typeof document === "undefined") return;
    visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopWorkPhase(lastCanvas);
    });
  }
  function engineFor(canvas) {
    if (engines) {
      let current = engines.get(canvas);
      if (!current) {
        current = createMotionEngine(canvas);
        engines.set(canvas, current);
      }
      return current;
    }
    let found = fallbackEngines.find((item) => item.canvas === canvas);
    if (!found) {
      found = createMotionEngine(canvas);
      fallbackEngines.push(found);
    }
    return found;
  }
  function isCanvas(value) {
    return !!(value && typeof value.getContext === "function");
  }
  function getLoop(canvas) {
    if (workLoops) return workLoops.get(canvas) || null;
    return fallbackLoops.find((item) => item.canvas === canvas) || null;
  }
  function setLoop(canvas, token) {
    if (workLoops) {
      workLoops.set(canvas, token);
      return;
    }
    fallbackLoops = fallbackLoops.filter((item) => item.canvas !== canvas);
    fallbackLoops.push(token);
  }
  function clearLoop(canvas) {
    const token = getLoop(canvas);
    if (token) {
      token.stopped = true;
      if (token.raf) cancelAnimationFrame(token.raf);
    }
    if (workLoops) workLoops.delete(canvas);
    else fallbackLoops = fallbackLoops.filter((item) => item.canvas !== canvas);
  }
  function resolvePlayCanvas(candidate) {
    if (isCanvas(candidate)) return candidate;
    if (typeof document === "undefined") return null;
    const canvases = Array.from(document.querySelectorAll('canvas#motionCanvas'));
    return canvases.reverse().find((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || canvases[0] || null;
  }
  function parsePlayArgs(a, b, c, d) {
    if (isCanvas(a)) return { canvas: a, partner: b, phase: c, extras: d || {} };
    const extras = c && typeof c === "object" && !isCanvas(c) ? c : {};
    return {
      canvas: resolvePlayCanvas(extras.canvas || lastCanvas),
      partner: a,
      phase: b,
      extras
    };
  }
  function stopWorkPhase(canvas) {
    const target = canvas || lastCanvas;
    if (!target) return;
    clearLoop(target);
  }
  function playWorkPhase(a, b, c, d) {
    const parsed = parsePlayArgs(a, b, c, d);
    const canvas = parsed.canvas;
    const partner = parsed.partner;
    const phase = parsed.phase;
    const extras = parsed.extras || {};
    const cut = normalizeWorkPhase(phase);
    const noop = { stop() {
    } };
    if (!canvas || !cut) return noop;
    lastCanvas = canvas;
    stopWorkPhase(canvas);
    const duration = Number(extras.durationMs) > 0 ? Number(extras.durationMs) : defaultWorkDuration(cut);
    const engine = engineFor(canvas);
    engine.visible = true;
    if (detectQuality(readBrowserQualityHints()).level === "static") {
      engine.frame(buildWorkTickInput(partner, cut, extras, 1));
      extras.onDone?.();
      return noop;
    }
    const token = { canvas, raf: 0, stopped: false };
    const start = performance.now();
    const step = (now) => {
      if (token.stopped) return;
      const local = Math.min(1, (now - start) / duration);
      engine.frame(buildWorkTickInput(partner, cut, extras, local));
      if (local < 1) token.raf = requestAnimationFrame(step);
      else {
        clearLoop(canvas);
        extras.onDone?.();
      }
    };
    setLoop(canvas, token);
    token.raf = requestAnimationFrame(step);
    return { stop() {
      stopWorkPhase(canvas);
    } };
  }
  var api = {
    resolve: resolveMotion,
    detectQuality,
    WORK_PHASES,
    normalizeWorkPhase,
    playWorkPhase,
    stopWorkPhase,
    tick(canvas, input) {
      if (!canvas) return;
      lastCanvas = canvas;
      if (getLoop(canvas)) return;
      engineFor(canvas).frame(input || {});
    },
    release(canvas) {
      if (!canvas) return;
      stopWorkPhase(canvas);
      if (engines && engines.has(canvas)) {
        engines.get(canvas)?.dispose();
        engines.delete(canvas);
        return;
      }
      for (let i = fallbackEngines.length - 1; i >= 0; i -= 1) {
        if (fallbackEngines[i].canvas !== canvas) continue;
        fallbackEngines[i].dispose();
        fallbackEngines.splice(i, 1);
      }
    }
  };
  if (typeof window !== "undefined") {
    window.PutdukMotion = api;
    bindVisibilityStop();
  }
})();
