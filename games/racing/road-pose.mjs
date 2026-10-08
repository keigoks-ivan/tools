// Convert the actual road tangent into a car-local pitch and roll after yaw.
export function roadPose(heading, roadHeading, slope) {
  const grade = Number.isFinite(slope) ? slope : 0, angle = heading - roadHeading;
  const along = grade * Math.cos(angle), across = grade * Math.sin(angle);
  return { pitch: -Math.atan(along), roll: -Math.atan2(across, Math.sqrt(1 + along * along)), grade: along };
}
