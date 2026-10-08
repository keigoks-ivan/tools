// Keep each finger independent so steering and a pedal can stay held together.
export function installTouchControls(controls, { canDrive, onChange }) {
  const held = new Map(Object.keys(controls).map(name => [name, new Set()]));
  const captures = new Map();
  const listeners = [];
  function update() {
    for (const [name, button] of Object.entries(controls)) {
      const pressed = held.get(name).size > 0;
      button.classList.toggle('is-pressed', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    }
    onChange({
      steer: Number(held.get('right').size > 0) - Number(held.get('left').size > 0),
      throttle: Number(held.get('throttle').size > 0),
      brake: Number(held.get('brake').size > 0),
      ...(held.has('handbrake') ? { handbrake: Number(held.get('handbrake').size > 0) } : {}),
    });
  }
  function listen(button, type, handler) {
    button.addEventListener(type, handler, { passive: false });
    listeners.push(() => button.removeEventListener(type, handler));
  }
  for (const [name, button] of Object.entries(controls)) {
    const contacts = held.get(name);
    // Touch Events also work in embedded browsers with incomplete pointer support.
    listen(button, 'touchstart', event => {
      event.preventDefault();
      if (!canDrive()) return;
      for (const touch of Array.from(event.changedTouches)) contacts.add(`touch:${touch.identifier}`);
      update();
    });
    listen(button, 'touchmove', event => event.preventDefault());
    for (const type of ['touchend', 'touchcancel']) listen(button, type, event => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) contacts.delete(`touch:${touch.identifier}`);
      update();
    });
    listen(button, 'pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      event.preventDefault();
      if (!canDrive()) return;
      contacts.add(`pointer:${event.pointerId}`);
      captures.set(event.pointerId, button);
      try { button.setPointerCapture(event.pointerId); } catch {}
      update();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, type, event => {
      if (event.pointerType === 'touch') return;
      contacts.delete(`pointer:${event.pointerId}`);
      captures.delete(event.pointerId);
      update();
    });
    listen(button, 'keydown', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      if (!canDrive()) return;
      contacts.add(`key:${event.code}`); update();
    });
    listen(button, 'keyup', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault(); contacts.delete(`key:${event.code}`); update();
    });
    listen(button, 'contextmenu', event => event.preventDefault());
  }
  function clear() {
    held.forEach(contacts => contacts.clear());
    for (const [id, button] of captures) {
      try { if (button.hasPointerCapture(id)) button.releasePointerCapture(id); } catch {}
    }
    captures.clear(); update();
  }
  return { clear, destroy() { clear(); listeners.forEach(remove => remove()); } };
}
