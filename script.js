(() => {
  'use strict';

  // Which way up each side rests, as rotateX() angles of the coin.
  const SIDES = {
    courtney: { label: 'Courtney', rest: 0 },
    sana: { label: 'Sana', rest: 180 },
  };

  const EDGE_SEGMENTS = 72; // must match the 5deg step in style.css
  const FLIGHT_MS = 1900; // toss up, spin, come back down
  const SETTLE_MS = 380; // small hop and rock as it lands
  const FADE_MS = 520; // reduced-motion cross-fade
  const PEAK_SCALE = 0.12; // grows 12% at the top of the toss (closer to the viewer)
  const LIGHT_DEG = 32; // key light sits this far above the line of sight
  const REST_DIFFUSE = Math.cos(LIGHT_DEG * (Math.PI / 180));
  const DEG = Math.PI / 180;

  const $ = (sel, root = document) => root.querySelector(sel);

  const arena = $('[data-arena]');
  const view = $('[data-view]');
  const toss = $('[data-toss]');
  const coin = $('[data-coin]');
  const shadow = $('[data-shadow]');
  const mirrorHost = $('[data-mirror]');
  const button = $('[data-flip]');
  const result = $('[data-result]');
  const resultName = $('[data-result-name]');
  const resultNote = $('[data-result-note]');
  const announcer = $('[data-announce]');
  const counts = {
    courtney: $('[data-count="courtney"]'),
    sana: $('[data-count="sana"]'),
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const tally = { courtney: 0, sana: 0 };
  let angle = 0; // current rotateX of the coin, in degrees
  let flipping = false;

  // ---------------------------------------------------------------------------
  // Build the 3D edge, then clone the whole coin for the floor reflection.
  // ---------------------------------------------------------------------------

  function buildEdge() {
    const edge = $('[data-edge]', coin);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < EDGE_SEGMENTS; i++) {
      const seg = document.createElement('span');
      // Top and bottom of the rim face the light when the coin tumbles on X; the sides stay dimmer.
      const facing = Math.abs(Math.sin((i / EDGE_SEGMENTS) * 2 * Math.PI));
      const k = 0.58 + 0.42 * Math.pow(facing, 0.7);
      seg.style.setProperty('--i', i);
      seg.style.backgroundColor = `rgb(${Math.round(196 * k)}, ${Math.round(148 * k)}, ${Math.round(92 * k)})`;
      frag.appendChild(seg);
    }
    edge.appendChild(frag);
  }

  function buildMirror() {
    const mirrorView = document.createElement('div');
    mirrorView.className = 'view view--mirror';
    const clone = toss.cloneNode(true);
    clone.removeAttribute('data-toss');
    const cloneCoin = $('.coin', clone);
    cloneCoin.removeAttribute('role');
    cloneCoin.removeAttribute('aria-label');
    cloneCoin.removeAttribute('data-coin');
    mirrorView.appendChild(clone);
    mirrorHost.appendChild(mirrorView);
    return { view: mirrorView, toss: clone, coin: cloneCoin };
  }

  buildEdge();
  const mirror = buildMirror();

  // Everything that moves together: the real coin and its reflection.
  const rigs = [
    { view, toss, coin },
    mirror,
  ].map((rig) => ({
    ...rig,
    faces: ['front', 'back'].map((name) => {
      const face = $(`[data-face="${name}"]`, rig.coin);
      return { shade: $('[data-shade]', face), sheen: $('[data-sheen]', face) };
    }),
  }));
  rigs.forEach((rig) => {
    rig.faces.forEach((face) => { face.sheenBand = $('i', face.sheen); });
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180; // -> [-180, 180)

  // Lambert shade + a narrow specular glint for a face tilted `rel` degrees
  // (positive = tipped up toward the key light).
  function lightFor(rel) {
    const diffuse = Math.cos((rel - LIGHT_DEG) * DEG);
    const spec = Math.pow(Math.max(0, Math.cos((rel - LIGHT_DEG / 2) * DEG)), 160);
    return {
      shade: clamp((REST_DIFFUSE - diffuse) * 0.95, 0, 0.78),
      spec,
      offset: clamp((rel - LIGHT_DEG / 2) * 2.6, -60, 60),
    };
  }

  /**
   * Draw one frame.
   * @param {{angle:number, lift?:number, scale?:number, opacity?:number, maxLift?:number}} p
   */
  function render(p) {
    const lift = p.lift || 0;
    const scale = p.scale || 1;
    const front = lightFor(wrap(p.angle));
    const back = lightFor(wrap(p.angle - 180));
    const tossTransform = `translate3d(0, ${(-lift).toFixed(2)}px, 0) scale3d(${scale}, ${scale}, ${scale})`;
    const coinTransform = `rotateX(${p.angle.toFixed(3)}deg)`;

    for (const rig of rigs) {
      rig.toss.style.transform = tossTransform;
      rig.coin.style.transform = coinTransform;
      rig.view.style.opacity = p.opacity == null ? '' : String(p.opacity);
      [front, back].forEach((l, i) => {
        const face = rig.faces[i];
        face.shade.style.opacity = l.shade.toFixed(3);
        face.sheen.style.opacity = (l.spec * 0.9).toFixed(3);
        face.sheenBand.style.transform = `translateY(${l.offset.toFixed(2)}%)`;
      });
    }

    // The floor shadow tightens and fades as the coin rises, and widens
    // front-to-back whenever the coin is lying flat mid-turn.
    const q = p.maxLift ? clamp(lift / p.maxLift, 0, 1) : 0;
    const flat = Math.abs(Math.sin(p.angle * DEG));
    shadow.style.transform =
      `translate(-50%, -50%) scale(${((1 - 0.3 * q) * scale).toFixed(3)}, ${((1 + 2.6 * flat) * (1 - 0.35 * q)).toFixed(3)})`;
    shadow.style.opacity = (1 - 0.6 * q).toFixed(3);
  }

  // ---------------------------------------------------------------------------
  // Randomness: the winner is decided up front, independently of the animation.
  // ---------------------------------------------------------------------------

  function pickSide() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return (buf[0] & 1) === 0 ? 'courtney' : 'sana'; // one unbiased random bit
    }
    return Math.random() < 0.5 ? 'courtney' : 'sana';
  }

  // Spin backwards (top edge toward the viewer) through 5–7 full turns, then
  // add whatever is needed so the winning face ends up pointing at the viewer.
  function targetAngleFor(side, from) {
    const turns = 5 + Math.floor(Math.random() * 3);
    let target = from - turns * 360;
    const current = ((target % 360) + 360) % 360;
    const extra = (current - SIDES[side].rest + 360) % 360;
    return target - extra;
  }

  // ---------------------------------------------------------------------------
  // Animations
  // ---------------------------------------------------------------------------

  const easeOutSpin = (u) => 1 - Math.pow(1 - u, 2.6);

  function animateToss(from, to, onDone) {
    const rect = arena.getBoundingClientRect();
    const size = rect.width;
    // Rise as high as the space above the coin allows, within reason.
    const maxLift = clamp(rect.top - (size * PEAK_SCALE) / 2 - 12, size * 0.1, size * 0.3);
    const hop = size * 0.03;
    const rock = 6; // degrees of wobble on landing
    const start = performance.now();
    let landed = false;

    function frame(now) {
      const t = now - start;

      if (t < FLIGHT_MS) {
        const u = t / FLIGHT_MS;
        const arc = 4 * u * (1 - u); // projectile parabola, 0 → 1 → 0
        render({
          angle: from + (to - from) * easeOutSpin(u),
          lift: maxLift * arc,
          scale: 1 + PEAK_SCALE * arc,
          maxLift,
        });
        requestAnimationFrame(frame);
        return;
      }

      if (!landed) {
        landed = true;
        arena.classList.remove('is-landed');
        void arena.offsetWidth; // restart the glow pulse
        arena.classList.add('is-landed');
      }

      const v = Math.min(1, (t - FLIGHT_MS) / SETTLE_MS);
      if (v < 1) {
        render({
          angle: to + rock * Math.sin(v * 2 * Math.PI) * Math.pow(1 - v, 1.5),
          lift: hop * Math.sin(v * Math.PI) * (1 - v),
          scale: 1,
          maxLift,
        });
        requestAnimationFrame(frame);
        return;
      }

      render({ angle: to });
      onDone();
    }

    requestAnimationFrame(frame);
  }

  // prefers-reduced-motion: fade the coin out, turn it, fade it back in.
  function animateFade(from, to, onDone) {
    const start = performance.now();

    function frame(now) {
      const v = Math.min(1, (now - start) / FADE_MS);
      const swapped = v >= 0.5;
      render({
        angle: swapped ? to : from,
        opacity: swapped ? (v - 0.5) * 2 : 1 - v * 2,
      });
      if (v < 1) {
        requestAnimationFrame(frame);
      } else {
        render({ angle: to });
        onDone();
      }
    }

    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------

  function setBusy(busy) {
    flipping = busy;
    button.setAttribute('aria-disabled', String(busy));
    document.body.classList.toggle('is-flipping', busy);
  }

  function hideResult() {
    result.classList.remove('is-revealed');
    result.classList.add('is-hidden');
    announcer.textContent = '';
  }

  function showResult(side) {
    const { label } = SIDES[side];
    resultName.textContent = label;
    resultNote.textContent = 'The coin has spoken.';
    result.classList.remove('is-idle', 'is-hidden');
    void result.offsetWidth; // restart the reveal animation
    result.classList.add('is-revealed');
    coin.setAttribute('aria-label', `Coin showing ${label}`);
    announcer.textContent = `${label}. The coin has spoken.`;
  }

  function flip() {
    if (flipping) return;
    setBusy(true);

    const side = pickSide();
    const from = angle;
    const to = targetAngleFor(side, from);
    hideResult();

    const finish = () => {
      // Keep the stored angle small; visually identical.
      angle = SIDES[side].rest;
      render({ angle });
      tally[side] += 1;
      counts[side].textContent = String(tally[side]);
      showResult(side);
      setBusy(false);
    };

    if (reducedMotion.matches) {
      animateFade(from, to, finish);
    } else {
      animateToss(from, to, finish);
    }
  }

  button.addEventListener('click', flip);
  arena.addEventListener('click', flip);

  render({ angle });
})();
