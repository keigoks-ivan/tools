const gameRoot = new URL('../', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return {
      url: new URL('lib/three.module.js', gameRoot).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith('three/addons/')) {
    return {
      url: new URL(`lib/${specifier.slice('three/'.length)}`, gameRoot).href,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
