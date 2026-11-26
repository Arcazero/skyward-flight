// input.js — keyboard and mouse, kept in one small module so the game
// loop never touches the DOM events directly.

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, active: false };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    mouse.down = true;
    mouse.active = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('pointerup', () => { mouse.down = false; });
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function pressed(key) {
    // One-shot: true once per physical press.
    if (keys.has(key)) {
      keys.delete(key);
      return true;
    }
    return false;
  }

  return {
    // -1..1 pitch (positive pulls the nose up), -1..1 roll (positive right).
    read() {
      let pitch = 0, roll = 0;
      if (keys.has('arrowup')) pitch += 1;
      if (keys.has('arrowdown')) pitch -= 1;
      if (keys.has('arrowleft')) roll -= 1;
      if (keys.has('arrowright')) roll += 1;
      // Mouse steering: hold the button and the nose follows the pointer.
      if (mouse.down && mouse.active) {
        const rect = canvas.getBoundingClientRect();
        const nx = (mouse.x - rect.left) / rect.width - 0.5;
        const ny = (mouse.y - rect.top) / rect.height - 0.5;
        roll += Math.max(-1, Math.min(1, nx * 2.4));
        pitch += Math.max(-1, Math.min(1, -ny * 2.4));
      }
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttleUp: keys.has('w'),
        throttleDown: keys.has('s'),
        brake: keys.has(' '),
        gear: pressed('g'),
        flaps: pressed('f'),
        camera: pressed('c'),
        pause: pressed('p'),
        mute: pressed('m'),
        restart: pressed('r'),
        menu: pressed('escape'),
      };
    },
    // Menu clicks: returns the pointer position of the latest press.
    clickPos() {
      if (mouse.down) {
        mouse.down = false;
        const rect = canvas.getBoundingClientRect();
        return { x: mouse.x - rect.left, y: mouse.y - rect.top };
      }
      return null;
    },
    clear() { keys.clear(); },
  };
}
