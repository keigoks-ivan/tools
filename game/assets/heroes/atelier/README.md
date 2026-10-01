# Runtime character materials — 2026-10-02

These assets are used by `game/3d-next/hero-art.js` in both the single-player and multiplayer runtime, and by the actual-model `hero-preview.html` turntable. They are textures, not replacement screenshots or concept art.

Generated with the built-in `image_gen` tool through the imagegen skill. No fallback CLI/API route was used. Selected images were copied from Codex's generated-images folder into this repository without replacing the source GLB.

| Saved asset | Purpose | Output source |
| --- | --- | --- |
| `material-atlas-v1.png` | 3 rows × 4 columns: cloth, trim, metal and leather for each character | `exec-e22899cc-aaf9-4d69-9b33-c4cecadc5e63.png` |
| `face-skin-v1.png` | Edited face albedo retaining the existing face UV layout | `exec-32eae363-aefe-4c51-b195-c9e803506469.png` |
| `hair-strands-v1.png` | Transparent fine hair-card albedo, tinted by character | `exec-fb870c6c-2b40-4d86-ad9a-170ece84a6f9.png` |

Final production prompt set:

1. **Material atlas:** Create a flat production texture atlas for three East Asian fantasy action-game warriors. Exactly three equal rows and four equal columns, with no text, labels, borders or cast shadows. Violet row: plum woven cloth, dark violet embroidered brocade, worn brushed brass, black leather. Azure row: blue wave-pattern cloth, layered scale detail, brushed steel, jade/teal trim. Amber row: rust-orange feather-pattern cloth, dark brown leather, aged bronze, tightly wrapped grip cord. Fine fibres, seams and subtle wear; diffuse albedo only, consistent illumination, tile interiors suitable for repeated mapping.
2. **Face UV edit:** Use the original model face texture as the edit target. Preserve its UV islands and the placement of the eyes, brows, mouth and face boundaries. Give the adult anime warrior subtle natural skin colour, delicate nose and lip definition, and restrained skin detail. No photographic face pasted over the UV layout, no new hair, no accessories, no text, no dramatic baked lighting.
3. **Hair cards:** Create a production 3D game HAIR CARD ALBEDO TEXTURE, not a character illustration. Square canvas. A single dense curtain of fine, realistic charcoal brown hair fibres occupies the center 80% width, flowing vertically from the top root edge to uneven wispy tapered tips at the bottom. Each individual strand is thin, smooth, slightly wavering, with subtle natural longitudinal highlights; low contrast dark grey brown values suitable for tinting to black, blue black or brown. Dense opaque roots taper into many delicate transparent flyaway tips, transparent margins. The field should contain about 200 hair fibres with irregular overlapping clumps, not thick parallel tubes, not braids, not striped fabric. Flat even diffuse light, no shadows cast onto a background, no baked bright specular bands. Straight-on orthographic flat texture sheet. Absolutely no face, scalp, body, hair accessories, text, borders, reference charts, labels or background. Preserve actual alpha transparency around the silhouette. This asset will map along curved 3D hair locks in an anime action game; make it feel like human hair rather than plastic.

The hair is bound to the existing head skeleton with bounded shader sway. It is not a strand-physics simulation. Weapons are closed 3D geometry with a blade ridge, thin polished edge, socket/guard, wrapped grip and physically lit steel; no glowing flat blade slabs. Character textures are shared across players with reference-counted disposal.
