/**
 * Dispose resources owned by a transient object tree.
 *
 * Sprite geometry is shared by Three.js and must never be disposed here.
 * Texture maps are also shared by transient and static materials, so material
 * disposal intentionally leaves textures alone.
 */
export function releaseTransient(root, scene) {
  if (!root) return;

  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.isMesh && object.geometry) geometries.add(object.geometry);
    const material = object.material;
    if (Array.isArray(material)) {
      for (const item of material) if (item) materials.add(item);
    } else if (material) {
      materials.add(material);
    }
  });

  if (scene) scene.remove(root);
  else if (root.parent) root.parent.remove(root);
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
