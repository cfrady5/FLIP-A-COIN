(() => {
  'use strict';

  const NAMES = { courtney: 'Courtney', sana: 'Sana' };

  // Classic 8-ball phrasing, each of which reads naturally before a name.
  const LEADS = [
    'Signs point to',
    'It is decidedly',
    'Without a doubt,',
    'My sources say',
    'Outlook good for',
    'As I see it,',
    'Most likely',
    'You may rely on',
  ];

  const SHAKE_MS = 1000;
  const TURN_MS = 480;
  const SINK_MS = 320;
  const RISE_MS = 1300;
  const TURN_EASE = 'cubic-bezier(0.45, 0, 0.25, 1)';

  // The "8" disc and the answer window sit on opposite sides of the ball.
  // Turning the ball slides one over the top while the other comes up from below.
  const FACE_UP = { transform: 'translateY(0%) scale(1, 1)', opacity: '1' };
  const FACE_ABOVE = { transform: 'translateY(-150%) scale(0.86, 0.3)', opacity: '0.4' };
  const FACE_BELOW = { transform: 'translateY(150%) scale(0.86, 0.3)', opacity: '0.4' };
  const DIE_SUNK = { transform: 'translateY(18%) scale(0.55) rotate(-30deg)', opacity: '0', filter: 'blur(6px)' };

  const SHAKE = [
    { transform: 'translate(0, 0) rotate(0deg)' },
    { transform: 'translate(-4%, -2%) rotate(-7deg)', offset: 0.1 },
    { transform: 'translate(5%, 1%) rotate(6deg)', offset: 0.22 },
    { transform: 'translate(-4%, -3%) rotate(-5deg)', offset: 0.36 },
    { transform: 'translate(4%, 2%) rotate(5deg)', offset: 0.5 },
    { transform: 'translate(-3%, -1%) rotate(-3deg)', offset: 0.64 },
    { transform: 'translate(2%, 1%) rotate(2deg)', offset: 0.78 },
    { transform: 'translate(-1%, 0) rotate(-1deg)', offset: 0.9 },
    { transform: 'translate(0, 0) rotate(0deg)' },
  ];

  const $ = (sel) => document.querySelector(sel);

  const arena = $('[data-arena]');
  const ball = $('[data-ball]');
  const eight = $('[data-ball-eight]');
  const windowEl = $('[data-ball-window]');
  const die = $('[data-ball-die]');
  const dieText = $('[data-ball-die-text]');
  const form = $('[data-ask]');
  const input = $('[data-question]');
  const button = $('[data-shake]');
  const result = $('[data-result]');
  const resultLead = $('[data-result-lead]');
  const resultName = $('[data-result-name]');
  const announcer = $('[data-announce]');
  const counts = {
    courtney: $('[data-count="courtney"]'),
    sana: $('[data-count="sana"]'),
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  const tally = { courtney: 0, sana: 0 };
  let windowUp = false; // false: the "8" faces the viewer; true: the answer window does
  let dieShown = DIE_SUNK;
  let asking = false;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // One unbiased random bit decides the answer before any animation starts.
  function pickSide() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return (buf[0] & 1) === 0 ? 'courtney' : 'sana';
    }
    return Math.random() < 0.5 ? 'courtney' : 'sana';
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function setStyles(el, frame) {
    for (const key of Object.keys(frame)) {
      if (key !== 'offset' && key !== 'easing') el.style[key] = frame[key];
    }
  }

  // Run a Web Animation, then bake its last frame into inline styles.
  function play(el, frames, options) {
    const anim = el.animate(frames, { fill: 'forwards', ...options });
    return anim.finished.then(() => {
      setStyles(el, frames[frames.length - 1]);
      anim.cancel();
    });
  }

  function turn(toWindow, duration) {
    windowUp = toWindow;
    return Promise.all(toWindow
      ? [play(eight, [FACE_UP, FACE_ABOVE], { duration, easing: TURN_EASE }),
        play(windowEl, [FACE_BELOW, FACE_UP], { duration, easing: TURN_EASE })]
      : [play(eight, [FACE_ABOVE, FACE_UP], { duration, easing: TURN_EASE }),
        play(windowEl, [FACE_UP, FACE_BELOW], { duration, easing: TURN_EASE })]);
  }

  // Write the answer on the die, shrinking it only if a fallback font runs wide.
  function inscribe(side) {
    const word = NAMES[side].toUpperCase();
    dieText.textContent = word;
    dieText.removeAttribute('textLength');
    dieText.removeAttribute('lengthAdjust');
    dieText.style.fontSize = word.length > 5 ? '26px' : '36px';
    const max = word.length > 5 ? 112 : 100;
    try {
      if (dieText.getComputedTextLength() > max) {
        dieText.setAttribute('textLength', String(max));
        dieText.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    } catch (e) { /* not rendered yet; the default size is fine */ }
  }

  // ---------------------------------------------------------------------------
  // Reveal sequences
  // ---------------------------------------------------------------------------

  async function revealAnimated(side) {
    const shaking = ball.animate(SHAKE, { duration: SHAKE_MS, easing: 'ease-in-out' });

    if (windowUp) {
      // The old answer sinks back into the murk while the ball is turned over.
      play(die, [dieShown, DIE_SUNK], { duration: SINK_MS, easing: 'ease-in' });
      await wait(120);
      await turn(false, TURN_MS);
    }
    await shaking.finished;

    inscribe(side);
    setStyles(die, DIE_SUNK);
    const turning = turn(true, TURN_MS + 80);
    await wait(TURN_MS * 0.55);

    const tilt = (Math.random() * 10 - 5).toFixed(1);
    dieShown = { transform: `translateY(0%) scale(1) rotate(${tilt}deg)`, opacity: '1', filter: 'blur(0px)' };
    await play(die, [DIE_SUNK, { opacity: '0.55', filter: 'blur(2px)', offset: 0.55 }, dieShown], {
      duration: RISE_MS,
      easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)',
    });
    await turning;
  }

  // prefers-reduced-motion: no shaking or turning, just short fades.
  async function revealGently(side) {
    if (windowUp) {
      await play(die, [{ opacity: '1' }, { opacity: '0' }], { duration: 180 });
    } else {
      setStyles(windowEl, { transform: FACE_UP.transform });
      await Promise.all([
        play(eight, [{ opacity: '1' }, { opacity: '0' }], { duration: 220 }),
        play(windowEl, [{ opacity: '0' }, { opacity: '1' }], { duration: 220 }),
      ]);
      setStyles(eight, FACE_ABOVE);
      windowUp = true;
    }

    inscribe(side);
    dieShown = { transform: 'none', opacity: '1', filter: 'none' };
    setStyles(die, { transform: 'none', filter: 'none' });
    await play(die, [{ opacity: '0' }, { opacity: '1' }], { duration: 320 });
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  function setBusy(busy) {
    asking = busy;
    button.setAttribute('aria-disabled', String(busy));
    document.body.classList.toggle('is-asking', busy);
  }

  function hideResult() {
    result.classList.remove('is-revealed');
    result.classList.add('is-hidden');
    announcer.textContent = '';
  }

  function showResult(side, lead, question) {
    const name = NAMES[side];
    resultLead.textContent = lead;
    resultName.textContent = name;
    result.classList.remove('is-idle', 'is-hidden');
    void result.offsetWidth; // restart the reveal animation
    result.classList.add('is-revealed');
    ball.setAttribute('aria-label', `Magic 8 Ball showing ${name}`);
    const asked = question ? `You asked: ${question}${/[.?!]$/.test(question) ? '' : '.'} ` : '';
    announcer.textContent = `${asked}${lead} ${name}.`;
  }

  async function ask(event) {
    if (event) event.preventDefault();
    if (asking) return;
    setBusy(true);

    const side = pickSide();
    const lead = LEADS[Math.floor(Math.random() * LEADS.length)];
    const question = input.value.trim();
    if (coarsePointer.matches) input.blur(); // drop the phone keyboard so the ball is visible
    hideResult();

    try {
      if (reducedMotion.matches) {
        await revealGently(side);
      } else {
        await revealAnimated(side);
      }
    } finally {
      tally[side] += 1;
      counts[side].textContent = String(tally[side]);
      showResult(side, lead, question);
      setBusy(false);
    }
  }

  form.addEventListener('submit', ask);
  arena.addEventListener('click', () => ask());
})();
