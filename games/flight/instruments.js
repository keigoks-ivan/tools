const KT = 1.94384449;
const FT = 3.2808399;
const NM = 1852;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = value => ((value % 360) + 360) % 360;
const angleDifference = value => ((value + 540) % 360) - 180;
const headingText = value => String(Math.round(wrap(value)) % 360).padStart(3, '0');
const color = { white: '#f0f7f8', dim: '#86a6ad', green: '#93efb0', magenta: '#f19cfa', amber: '#ffda8b', dark: '#070e14', line: '#39525d' };

export function createInstruments(pfdCanvas, ndCanvas) {
  const pfd = pfdCanvas.getContext('2d'), nd = ndCanvas.getContext('2d');
  function prepare(canvas, context, width, height) {
    const pixelRatio = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2.5);
    const displayScale = Math.max(0.45, Math.min((canvas.clientWidth || width) / width, (canvas.clientHeight || height) / height));
    const scale = displayScale * pixelRatio;
    const pixelWidth = Math.round(width * scale), pixelHeight = Math.round(height * scale);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = color.dark; context.fillRect(0, 0, width, height);
    context.lineWidth = 1;
    context.lineCap = 'round'; context.lineJoin = 'round';
  }
  function text(ctx, value, x, y, size = 11, fill = color.white, align = 'center', weight = 500) {
    ctx.fillStyle = fill; ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
  }
  function line(ctx, x1, y1, x2, y2, fill = color.white, width = 1) {
    ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function polygon(ctx, points, fill, stroke, width = 1) {
    ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function diamond(ctx, x, y, fill = color.magenta, size = 5) {
    polygon(ctx, [[x, y - size], [x + size, y], [x, y + size], [x - size, y]], null, fill, 1.6);
  }
  function clip(ctx, x, y, width, height) {
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  }

  function drawPFD(state, data, options) {
    prepare(pfdCanvas, pfd, 440, 280);
    const cx = 209, cy = 131, pitchScale = 3.1;
    const pitch = data.pitch || 0, roll = data.roll || 0;
    const speed = Math.max(0, (data.indicatedAirspeed || 0) * KT);
    const altitudeOffset = options.altitudeOffset || 0;
    const altitude = ((data.altitude || 0) + altitudeOffset) * FT;
    const heading = wrap((data.heading || 0) + (options.headingOffset || 0));
    const ap = options.ap || state.autopilot || {};

    pfd.fillStyle = '#0b191e'; pfd.fillRect(0, 0, 440, 23);
    for (const x of [89, 244, 333]) line(pfd, x, 3, x, 20, color.line);
    if (options.rpmMax && data.engineRpm != null) { // piston engine: RPM readout with a small bar, scaled to the redline
      text(pfd, `${Math.round(data.engineRpm / 10) * 10} RPM`, 43, 9, 9, color.green);
      pfd.fillStyle = '#1d3138'; pfd.fillRect(10, 17, 66, 3); pfd.fillStyle = data.engineRpm > options.rpmMax * 0.98 ? color.amber : color.green; pfd.fillRect(10, 17, 66 * clamp(data.engineRpm / options.rpmMax, 0, 1), 3);
    } else text(pfd, data.onGround ? 'GROUND' : (options.powerLabel || 'THRUST'), 43, 11, 9, color.green);
    text(pfd, ap.enabled ? 'HDG' : 'MANUAL', 162, 11, 11, color.green);
    text(pfd, ap.enabled ? 'ALT' : 'PITCH', 286, 11, 10, color.green);
    text(pfd, ap.enabled ? 'AP 1' : 'FD OFF', 386, 11, 10, ap.enabled ? color.green : color.dim);

    pfd.save(); clip(pfd, 88, 30, 241, 194);
    pfd.translate(cx, cy); pfd.rotate(-roll * RAD); pfd.translate(0, pitch * pitchScale);
    const sky = pfd.createLinearGradient(0, -250, 0, 0); sky.addColorStop(0, '#095884'); sky.addColorStop(1, '#3396be');
    const ground = pfd.createLinearGradient(0, 0, 0, 300); ground.addColorStop(0, '#8c5834'); ground.addColorStop(1, '#422d22');
    pfd.fillStyle = sky; pfd.fillRect(-500, -800, 1000, 800);
    pfd.fillStyle = ground; pfd.fillRect(-500, 0, 1000, 800);
    line(pfd, -500, 0, 500, 0, '#f4fbf9', 1.4);
    for (let angle = -80; angle <= 80; angle += 5) {
      if (!angle) continue;
      const y = -angle * pitchScale, major = angle % 10 === 0, length = major ? 24 : 12;
      line(pfd, -length, y, length, y, '#e8f3ee', major ? 1.4 : 1);
      if (major) { text(pfd, Math.abs(angle), -length - 14, y, 10); text(pfd, Math.abs(angle), length + 14, y, 10); }
    }
    pfd.restore();

    // The bank scale stays fixed to the instrument, while the pointer follows bank.
    pfd.strokeStyle = color.white; pfd.lineWidth = 1; pfd.beginPath(); pfd.arc(cx, cy, 84, -150 * RAD, -30 * RAD); pfd.stroke();
    for (const bank of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = (bank - 90) * RAD, outer = bank % 30 === 0 ? 94 : 90;
      line(pfd, cx + Math.cos(a) * 84, cy + Math.sin(a) * 84, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer, color.white, bank === 0 ? 2 : 1);
    }
    pfd.save(); pfd.translate(cx, cy); pfd.rotate(-roll * RAD);
    polygon(pfd, [[0, -82], [-5, -73], [5, -73]], null, color.white, 1.6); pfd.restore();
    const slip = clamp((data.sideslip || 0) / 8, -1, 1) * 24;
    line(pfd, cx - 23, 217, cx + 23, 217, color.white);
    polygon(pfd, [[cx + slip - 6, 210], [cx + slip + 6, 210], [cx + slip + 6, 214], [cx + slip - 6, 214]], color.white);
    polygon(pfd, [[cx - 51, cy - 2], [cx - 18, cy - 2], [cx - 18, cy + 7], [cx - 22, cy + 7], [cx - 22, cy + 2], [cx - 51, cy + 2]], '#ffdf5b', '#1d2a27');
    polygon(pfd, [[cx + 51, cy - 2], [cx + 18, cy - 2], [cx + 18, cy + 7], [cx + 22, cy + 7], [cx + 22, cy + 2], [cx + 51, cy + 2]], '#ffdf5b', '#1d2a27');
    pfd.strokeStyle = '#ffdf5b'; pfd.lineWidth = 2; pfd.strokeRect(cx - 3, cy - 3, 6, 6);

    // Airspeed tape: every ten knots is labeled, with the stall range in red.
    text(pfd, 'IAS KT', 38, 28, 8, color.dim);
    pfd.save(); clip(pfd, 7, 35, 65, 189); pfd.fillStyle = '#172b36'; pfd.fillRect(7, 35, 65, 189);
    const speedScale = 2.15;
    for (let mark = Math.max(0, Math.floor((speed - 50) / 5) * 5); mark <= speed + 50; mark += 5) {
      const y = cy + (speed - mark) * speedScale;
      line(pfd, mark % 10 === 0 ? 52 : 59, y, 69, y, color.white);
      if (mark % 10 === 0) text(pfd, mark, 44, y, 12, color.white, 'right');
    }
    const stallY = cy + (speed - (data.stallSpeed || 0) * KT) * speedScale;
    pfd.fillStyle = '#d75c48'; pfd.fillRect(66, clamp(stallY, 35, 224), 5, Math.max(0, 224 - stallY));
    if (ap.enabled) {
      const y = clamp(cy + (speed - (ap.speed || 0) * KT) * speedScale, 38, 222);
      polygon(pfd, [[71, y - 5], [62, y - 5], [62, y + 5], [71, y + 5]], null, color.magenta, 2);
    }
    pfd.restore();
    polygon(pfd, [[7, cy - 16], [59, cy - 16], [73, cy], [59, cy + 16], [7, cy + 16]], '#071015', color.white, 1.2);
    text(pfd, String(Math.round(speed)).padStart(3, '0'), 37, cy + 1, 21, color.white);
    text(pfd, Math.round((ap.speed || 0) * KT), 38, 235, 12, ap.enabled ? color.magenta : color.dim);

    // Altimeter tape and a separate vertical-speed needle.
    text(pfd, 'ALT FT', 371, 28, 8, color.dim);
    pfd.save(); clip(pfd, 339, 35, 64, 189); pfd.fillStyle = '#172b36'; pfd.fillRect(339, 35, 64, 189);
    const altitudeScale = 0.074;
    for (let mark = Math.floor((altitude - 1400) / 100) * 100; mark <= altitude + 1400; mark += 100) {
      const y = cy + (altitude - mark) * altitudeScale;
      line(pfd, 340, y, mark % 500 === 0 ? 350 : 346, y, color.white);
      if (mark % 500 === 0) text(pfd, mark, 398, y, 11, color.white, 'right');
    }
    if (ap.enabled) {
      const y = clamp(cy + (altitude - ((ap.altitude || 0) + altitudeOffset) * FT) * altitudeScale, 38, 222);
      polygon(pfd, [[339, y - 5], [348, y - 5], [348, y + 5], [339, y + 5]], null, color.magenta, 2);
    }
    pfd.restore();
    polygon(pfd, [[403, cy - 16], [350, cy - 16], [335, cy], [350, cy + 16], [403, cy + 16]], '#071015', color.white, 1.2);
    text(pfd, Math.round(altitude), 374, cy + 1, 18, color.white);
    text(pfd, Math.round(((ap.altitude || 0) + altitudeOffset) * FT), 371, 235, 11, ap.enabled ? color.magenta : color.dim);
    text(pfd, 'V/S', 422, 29, 8, color.dim);
    const verticalSpeed = (data.verticalSpeed || 0) * FT * 60;
    line(pfd, 419, cy - 78, 419, cy + 78, color.dim);
    for (const value of [-2000, -1000, 0, 1000, 2000]) {
      const y = cy - value / 2000 * 70;
      line(pfd, 414, y, 422, y, color.white);
      if (value) text(pfd, Math.abs(value / 1000), 431, y, 8, color.dim);
    }
    line(pfd, 408, cy, 420, cy - clamp(verticalSpeed / 2000, -1.13, 1.13) * 70, color.green, 2);
    text(pfd, `${verticalSpeed < 0 ? '−' : '+'}${Math.abs(verticalSpeed / 1000).toFixed(1)}`, 421, 226, 8, color.green);

    // ILS deviation bars use degrees from the model, not aircraft attitude.
    const locY = 236, gsX = 325;
    for (const offset of [-2, -1, 0, 1, 2]) {
      pfd.strokeStyle = '#cedfdf'; pfd.lineWidth = 1; pfd.beginPath(); pfd.arc(cx + offset * 21, locY, 1.4, 0, Math.PI * 2); pfd.stroke();
      pfd.beginPath(); pfd.arc(gsX, cy + offset * 25, 1.4, 0, Math.PI * 2); pfd.stroke();
    }
    if (data.ilsValid !== false) diamond(pfd, cx - clamp((data.localizerDeviation ?? data.localizer ?? 0) / 2.5, -1, 1) * 43, locY);
    if (data.gsValid !== false) diamond(pfd, gsX, cy + clamp((data.glideslopeDeviation ?? data.glideslope ?? 0) / 0.7, -1, 1) * 51);
    text(pfd, `RA ${Math.max(0, Math.round(((data.agl || 0) - (options.gearHeight ?? 4)) * FT))}`, 279, 214, 10, color.green);
    const warning = data.crashed ? 'FLIGHT ENDED' : data.stallWarning ? 'STALL' : data.overspeedWarning ? 'OVERSPEED' : data.gearWarning ? 'GEAR' : '';
    if (warning) {
      pfd.fillStyle = '#501c17'; pfd.fillRect(cx - 52, 186, 104, 20);
      text(pfd, warning, cx, 196, 10, '#ffba95', 'center', 700);
    }

    pfd.fillStyle = '#0e1c25'; pfd.fillRect(88, 246, 241, 33);
    pfd.save(); clip(pfd, 88, 246, 241, 33);
    for (let mark = Math.floor((heading - 45) / 10) * 10; mark <= heading + 45; mark += 10) {
      const x = cx + (mark - heading) * 2.8;
      line(pfd, x, 248, x, 254, color.white);
      text(pfd, String(Math.round(wrap(mark) / 10) % 36).padStart(2, '0'), x, 264, 10);
    }
    if (ap.enabled) {
      const x = clamp(cx + angleDifference((ap.heading || 0) + (options.headingOffset || 0) - heading) * 2.8, 91, 326);
      polygon(pfd, [[x, 248], [x - 4, 254], [x + 4, 254]], color.magenta);
    }
    pfd.restore();
    pfd.fillStyle = '#081218'; pfd.fillRect(cx - 23, 254, 46, 22); pfd.strokeStyle = color.white; pfd.lineWidth = 1; pfd.strokeRect(cx - 23, 254, 46, 22);
    text(pfd, headingText(heading), cx, 265, 14, color.white);
    text(pfd, options.airport?.ils?.ident || 'ILS', 8, 260, 9, color.magenta, 'left');
    text(pfd, 'TRU', 320, 274, 6, color.dim, 'right');
    text(pfd, '1013 HPA', 403, 260, 9, color.green, 'right');
  }

  function drawND(state, data, options) {
    prepare(ndCanvas, nd, 300, 280);
    const cx = 150, cy = 229, radius = 171;
    const heading = data.heading || 0, trueHeading = wrap(heading + (options.headingOffset || 0));
    const position = state.position || { x: 0, z: 0 };
    const runway = options.runway || { nearThreshold: 1830, farThreshold: -1830 };
    const target = options.target || { x: 0, z: runway.nearThreshold };
    const distance = Math.hypot(target.x - position.x, target.z - position.z);
    const range = distance < 3 * NM ? 4 : distance < 7 * NM ? 8 : distance < 14 * NM ? 16 : 32;
    const scale = radius / (range * NM), sine = Math.sin(heading * RAD), cosine = Math.cos(heading * RAD);
    function project(point) {
      const dx = point.x - position.x, dz = point.z - position.z;
      return [cx + (dx * cosine + dz * sine) * scale, cy - (dx * sine - dz * cosine) * scale];
    }
    nd.fillStyle = '#102026'; nd.fillRect(0, 0, 300, 37);
    text(nd, `GS ${Math.round((data.groundSpeed || 0) * KT)}`, 9, 12, 10, color.green, 'left');
    text(nd, `TAS ${Math.round((data.airspeed || 0) * KT)}`, 9, 27, 9, color.dim, 'left');
    text(nd, headingText(trueHeading), cx, 15, 18, color.white);
    text(nd, 'TRU', cx + 39, 15, 8, color.dim);
    text(nd, 'ARC', 290, 12, 9, color.green, 'right');
    text(nd, `${options.airport?.runway?.ident || ''} / ${options.airport?.runway?.reciprocal || ''}`, 290, 28, 8, color.magenta, 'right');

    nd.save(); clip(nd, 0, 38, 300, 212);
    for (const fraction of [0.5, 1]) {
      nd.strokeStyle = fraction === 1 ? '#64828c' : '#29434e'; nd.lineWidth = 1;
      if (fraction !== 1) nd.setLineDash([3, 5]);
      nd.beginPath(); nd.arc(cx, cy, radius * fraction, -170 * RAD, -10 * RAD); nd.stroke(); nd.setLineDash([]);
      text(nd, range * fraction, cx + 4, cy - radius * fraction + 8, 8, color.dim, 'left');
    }
    for (let bearing = Math.floor((trueHeading - 90) / 5) * 5; bearing <= trueHeading + 90; bearing += 5) {
      const angle = (bearing - trueHeading - 90) * RAD, major = bearing % 10 === 0;
      line(nd, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, cx + Math.cos(angle) * (radius - (major ? 9 : 5)), cy + Math.sin(angle) * (radius - (major ? 9 : 5)), color.white);
      if (bearing % 30 === 0) text(nd, String(Math.round(wrap(bearing) / 10) % 36).padStart(2, '0'), cx + Math.cos(angle) * (radius - 21), cy + Math.sin(angle) * (radius - 21), 10);
    }
    polygon(nd, [[cx, cy - radius - 2], [cx - 5, cy - radius - 9], [cx + 5, cy - radius - 9]], color.white);

    const near = project({ x: 0, z: runway.nearThreshold }), far = project({ x: 0, z: runway.farThreshold });
    const halfWidth = Math.max(2, (runway.width || 60) * scale / 2);
    const dx = far[0] - near[0], dy = far[1] - near[1], length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length * halfWidth, ny = dx / length * halfWidth;
    polygon(nd, [[near[0] + nx, near[1] + ny], [far[0] + nx, far[1] + ny], [far[0] - nx, far[1] - ny], [near[0] - nx, near[1] - ny]], '#223b45', color.white, 1);
    line(nd, near[0], near[1], far[0], far[1], '#b9e2d2', 1);
    line(nd, near[0] - nx * 3, near[1] - ny * 3, near[0] + nx * 3, near[1] + ny * 3, color.green, 1.4);
    text(nd, options.airport?.runway?.ident || '', near[0] + 15, near[1] + 8, 9, color.green, 'left');
    text(nd, options.airport?.runway?.reciprocal || '', far[0] + 12, far[1] - 6, 8, color.dim, 'left');
    const airport = project({ x: -650, z: 0 });
    text(nd, options.airport?.icao || '', airport[0] - 4, airport[1], 9, color.dim, 'right');

    const route = options.route || [];
    if (route.length) {
      nd.strokeStyle = color.magenta; nd.lineWidth = 1.5; nd.beginPath();
      route.forEach((point, index) => { const p = project(point); index ? nd.lineTo(...p) : nd.moveTo(...p); }); nd.stroke();
      route.forEach((point, index) => {
        const p = project(point); diamond(nd, p[0], p[1], color.magenta, 4);
        if (p[0] > 12 && p[0] < 275 && p[1] > 58 && p[1] < 230) text(nd, point.name || `WP${String(index + 1).padStart(2, '0')}`, p[0] + 7, p[1] - 7, 8, color.magenta, 'left');
      });
    }
    const targetPoint = project(target);
    nd.setLineDash([4, 4]); line(nd, cx, cy, targetPoint[0], targetPoint[1], color.magenta, 1.3); nd.setLineDash([]);
    diamond(nd, targetPoint[0], targetPoint[1], color.magenta, 6);
    const ap = options.ap || state.autopilot || {};
    if (ap.enabled) {
      const angle = ((ap.heading || 0) - heading - 90) * RAD;
      nd.setLineDash([5, 5]); line(nd, cx, cy, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, color.magenta, 1); nd.setLineDash([]);
      diamond(nd, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, color.magenta, 5);
    }
    const trackAngle = ((data.groundTrack ?? heading) - heading - 90) * RAD;
    line(nd, cx, cy - 13, cx + Math.cos(trackAngle) * 78, cy + Math.sin(trackAngle) * 78, '#8ad9bc', 1);
    polygon(nd, [[cx, cy - 12], [cx - 7, cy + 8], [cx, cy + 4], [cx + 7, cy + 8]], color.white);
    nd.restore();

    const windHeading = wrap((data.windDirection || 0) + (options.headingOffset || 0));
    text(nd, `${headingText(windHeading)}°/${Math.round((data.windSpeed || 0) * KT)}`, 10, 47, 8, color.dim, 'left');
    nd.fillStyle = '#102026'; nd.fillRect(0, 252, 300, 28); line(nd, 0, 251, 300, 251, color.line);
    text(nd, target.name || `RWY ${options.airport?.runway?.ident || ''}`, 9, 262, 9, color.magenta, 'left');
    text(nd, `${(distance / NM).toFixed(1)} NM`, cx, 262, 11, color.green);
    text(nd, `RNG ${range}`, 291, 262, 9, color.dim, 'right');
  }

  function draw(state = {}, data = {}, options = {}) {
    drawPFD(state, data, options);
    drawND(state, data, options);
  }
  function dispose() {
    pfd.clearRect(0, 0, pfdCanvas.width, pfdCanvas.height);
    nd.clearRect(0, 0, ndCanvas.width, ndCanvas.height);
  }
  return { draw, dispose };
}
