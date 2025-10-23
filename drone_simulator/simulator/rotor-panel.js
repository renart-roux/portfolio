
;(function () {
  const PANEL_ID = "dronePowerPanel";
  const MINI_ID = "miniDrone";
  const LIST_ID = "rotorList";

  // --- Config definitions ----------------------------------------------------
  // For each config: positions (x,y px in a 200x200 box), CW/CCW spin, and labels.
  const CONFIGS = {
    "quadx": {
      size: 200,
      rotors: [
        { id: "R1", x: -55, y: -55, spin: "CCW"},
        { id: "R2", x:  55, y: -55, spin: "CW"},
        { id: "R3", x: -55, y:  55, spin: "CW"},
        { id: "R4", x:  55, y:  55, spin: "CCW"},
      ],
      arms: [[-55,-55, 55,55], [55,-55, -55,55]]
    },
    "quad+": {
      size: 200,
      rotors: [
        { id: "R1", x:  0, y: -75, spin: "CCW"},
        { id: "R2", x:  75, y:  0, spin: "CW"},
        { id: "R3", x:  0, y:  75, spin: "CCW"},
        { id: "R4", x: -75, y:  0, spin: "CW"},
      ],
      arms: [[0,-75, 0,75], [-75,0, 75,0]]
    },
    "hex+": {
      size: 220,
      ...hexPoints(75, 0) // + configuration (one rotor forward)
    },
    "hexx": {
      size: 220,
      ...hexPoints(75, 30) // X configuration (gap forward)
    }
  };

  function hexPoints(r, offsetDeg) {
    // 6 evenly spaced, starting at offsetDeg (0=up). Alternate spin CW/CCW.
    const rotors = [];
    const arms = [];
    for (let i = 0; i < 6; i++) {
      const a = ((-90 + offsetDeg) + i * 60) * Math.PI/180; // -90 so 0deg = up
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      rotors.push({ id: `R${i+1}`, x, y, spin: i % 2 ? "CW":"CCW"});
      arms.push([0,0, x, y]);
    }
    return { rotors: rotors, arms: arms };
  }

  // --- DOM creation ----------------------------------------------------------
  function ensurePanel() {
    if (document.getElementById(PANEL_ID)) return;

    // Reuse the overlay on the right if present, append our panel under config buttons.
    rightOverlay = document.createElement("div");
    rightOverlay.className = "overlay position-right-120px position-vcenter";
    document.body.appendChild(rightOverlay);

    const wrapper = document.createElement("div");
    wrapper.id = PANEL_ID;
    wrapper.innerHTML = `
      <div class="instructions"><strong>Drone power</strong></div>
      <div class="mini-wrap">
        <svg id="${MINI_ID}" viewBox="-120 -120 240 240" width="200" height="200"></svg>
      </div>
    `;
    rightOverlay.appendChild(wrapper);

    injectStyles();
  }

  function injectStyles() {
    if (document.getElementById("rotorPanelStyles")) return;
    const css = `
    #${PANEL_ID} { margin-top: 10px }
    #${PANEL_ID} .mini-wrap { display:flex; gap:10px; align-items:center }
    #${MINI_ID} { background: rgba(255,255,255,.04); border-radius:12px; }
    #${PANEL_ID} .arm { stroke: rgba(255,255,255,.35); stroke-width: 6; stroke-linecap: round; }
    #${PANEL_ID} .rotor { fill: #9aa5b1 }
    #${PANEL_ID} .rotorPower { fill: #ff0000; opacity:1 }
    #${PANEL_ID} .spin { font: 10px/1 system-ui; fill: #cbd5e1 }
    #${PANEL_ID} .label { font: 11px/1.2 system-ui; fill: #e5e7eb }
    #${LIST_ID} { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    #${LIST_ID} .row { display:flex; align-items:center; gap:8px; background: rgba(255,255,255,.06); padding:6px 8px; border-radius:8px }
    #${LIST_ID} .bar { width: 80px; height: 6px; background: rgba(255,255,255,.15); border-radius:999px; overflow:hidden }
    #${LIST_ID} .fill { height:100%; width:0%; background: linear-gradient(90deg,#7aa2ff,#87f5a0) }
    #${LIST_ID} .pct { margin-left:auto; font-variant-numeric: tabular-nums }
    #${PANEL_ID} .legend { display:flex; flex-direction:column; gap:4px; font: 11px/1 system-ui; opacity:.8 }
    #${PANEL_ID} .swatch { display:inline-block; width:12px; height:6px; border-radius:3px; margin-right:6px; vertical-align:middle }
    #${PANEL_ID} .swatch-low { background:#9aa5b1 }
    #${PANEL_ID} .swatch-mid { background:#7aa2ff }
    #${PANEL_ID} .swatch-high { background:#87f5a0 }

    #${PANEL_ID} .rotorArrow { fill: none; stroke: rgba(255,255,255,.85); stroke-width: 2; }
    #${PANEL_ID} .rotorArrowHead { fill: rgba(255,255,255,.85); }
`;
    const style = document.createElement("style");
    style.id = "rotorPanelStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- Renderers -------------------------------------------------------------
  let currentConfigName = "quadx";
  let currentConfig = CONFIGS[currentConfigName];
  const rotorNodes = new Map();

  function drawMini() {
    ensurePanel();
    rotorNodes.clear();

    const svg = document.getElementById(MINI_ID);
    svg.innerHTML = "";
    // Ensure arrow marker defs exist
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.appendChild(defs);
    }
    let marker = svg.querySelector('#arrowhead');
    if (!marker) {
      marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", "arrowhead");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("refX", "5");
      marker.setAttribute("refY", "3");
      marker.setAttribute("orient", "auto");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M0,0 L6,3 L0,6 Z");
      path.setAttribute("class", "rotorArrowHead");
      marker.appendChild(path);
      defs.appendChild(marker);
    }


    const cfg = currentConfig;
    // Draw arms
    (cfg.arms || []).forEach(([x1,y1,x2,y2]) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("class", "arm");
      svg.appendChild(line);
    });

    // Draw center body
    const body = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    body.setAttribute("cx", 0);
    body.setAttribute("cy", 0);
    body.setAttribute("r", 15);
    body.setAttribute("fill", "#e5e7eb");
    body.setAttribute("opacity", "1");
    svg.appendChild(body);

    // Draw rotors
    for (const rotor of cfg.rotors) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${rotor.x},${rotor.y})`);

      const disc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      disc.setAttribute("r", 20);
      disc.setAttribute("class", "rotor");
      g.appendChild(disc);

      // Inner circle grows with power
      const power = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      power.setAttribute("r", 0);
      power.setAttribute("class", "rotorPower");
      g.appendChild(power);
      // Curved arrow indicating spin direction
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const rOuter = 26; // slightly outside rotor disc (20)
      // draw an arc about ~300 degrees, ending near the starting point with an arrowhead
      // We parametrize differently for CW vs CCW by the sweep-flag.
      const startAng = -Math.PI * 0.2;  // -36 degrees
      const endAng   =  Math.PI * 1.4;  // 252 degrees
      const a1 = rotor.spin === "CW" ? endAng : startAng;
      const a2 = rotor.spin === "CW" ? startAng : endAng;
      const x1 = Math.cos(a1) * rOuter;
      const y1 = Math.sin(a1) * rOuter;
      const x2 = Math.cos(a2) * rOuter;
      const y2 = Math.sin(a2) * rOuter;
      const largeArc = 1; // draw the longer side
      const sweep = rotor.spin === "CW" ? 0 : 1;
      const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
      arrow.setAttribute("d", d);
      arrow.setAttribute("class", "rotorArrow");
      arrow.setAttribute("marker-end", "url(#arrowhead)");
      g.appendChild(arrow);


      svg.appendChild(g);
      rotorNodes.set(rotor.id, { group:g, power });
    }
  }

  function clamp01(x){ return Math.min(1, Math.max(0, x)); }
  function clampSym(x) {
    return Math.max(-1, Math.min(1, x));
  }

  function updatePowers(outputs) {
    if (!outputs || !outputs.length) return;
    const n = outputs.length;
    for (let i=0; i<n; i++) {
      const rotor = currentConfig.rotors[i];
      if (!rotor) continue;
      const val = clamp01(outputs[i]);
      const node = rotorNodes.get(rotor.id);
      if (node) {
        node.power.setAttribute("r", 3 + val * 12); // visual magnitude
      }
      const fill = document.getElementById(`fill-${rotor.id}`);
      const pct = document.getElementById(`pct-${rotor.id}`);
      if (fill) fill.style.width = `${Math.round(val*100)}%`;
      if (pct) pct.textContent = `${Math.round(val*100)}%`;
    }
  }

  // --- Public API ------------------------------------------------------------
  function setConfig(name) {
    currentConfigName = name in CONFIGS ? name : "quadx";
    currentConfig = CONFIGS[currentConfigName];
    drawMini();
  }

  // Re-draw on first run
  setTimeout(() => {
    ensurePanel();
    setConfig(currentConfigName);
  }, 0);

  window.computeMotorPowers = function(state) {
    const cfg = CONFIGS[(state.configuration || currentConfigName)];
    if (!cfg) return [];
    const rotors = cfg.rotors;

    // Normalize geometry so roll/pitch mixing is scaled by arm length.
    const rMax = Math.max(
      1,
      ...rotors.map(r => Math.hypot(r.x, r.y))
    );

    // Controls in [-1..1]
    const t = clamp01(state.power); // baseline throttle
    const rollCmd   = clampSym((state.strafeVel   || 0) / (state.maxStrafe   || 1));   // left/right
    const pitchCmd  = clampSym((state.forwardVel  || 0) / (state.maxForward  || 1));   // forward/back
    const yawCmd    = clampSym((state.yawRate     || 0) / (state.maxYawRate  || Math.PI)); // yaw rate

    // Mixer gains — tuned to keep headroom. Tweak if you want snappier response.
    const G = {
      roll:  0.5,
      pitch: 0.5,
      yaw:   0.25
    };

    const out = new Array(rotors.length);
    for (let i = 0; i < rotors.length; i++) {
      const r = rotors[i];
      const xNorm = r.x / rMax;           // right positive
      const yNorm = r.y / rMax;           // down/back positive; front is negative
      const spin  = (r.spin === "CCW") ? +1 : -1;

      // roll: increase power on rotors on the side we want to “push down”
      const rollMix  =  G.roll  * ( rollCmd * xNorm );

      // pitch: forwardCmd > 0 means we want to move forward
      // Nose-down => more rear, less front. Front has y < 0 in our panels.
      const pitchMix =  G.pitch * ( pitchCmd * yNorm );

      // yaw: accelerate CCW rotors for positive yaw (right-hand rule, up-axis)
      const yawMix   =  G.yaw   * ( yawCmd * spin );

      out[i] = clamp01(t + rollMix + pitchMix + yawMix);
    }
    return out;
  };

  // Hook existing changeDroneConfiguration if present
  (function hookConfigChange(){
    const orig = window.changeDroneConfiguration;
    window.changeDroneConfiguration = function(name, el){
      if (typeof orig === "function") orig(name, el);
      // Normalize names from buttons
      const map = { "quadx":"quadx", "quad+":"quad+", "hex+":"hex+", "hexx":"hexx", "quad":"quad+" , "hex":"hex+" };
      const resolved = map[(name||"").toLowerCase()] || "quadx";
      setConfig(resolved);
    };
  })();

  // Expose direct API too
  window.setRotorConfig = setConfig;
  window.reportMotorPowers = function(outputs){ updatePowers(outputs); };

})();
