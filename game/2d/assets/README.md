# 2D runtime art

Built-in `image_gen` mode, generated 2026-09-24. Art direction reference: `game/design/anime-direction-v2.png`. These are actual runtime PNG assets; no API-key or external CLI image generation was used. Original generated pixels and alpha are retained. Cropping and ground-anchor metadata live in `../main.js`; the generated atlases did not exactly obey the requested grid, so the hero uses individually inspected crop rectangles.

| File | Pixels | Use |
| --- | --- | --- |
| `rumi-actions-v2.png` | 1254×1254 RGBA | 9 key poses: idle, 2 run, 3 light-slash, 3 heavy-slash |
| `enemies-actions-v1.png` | 1254×1254 RGBA | 2 enemy designs, 8 poses each |
| `night-market-v1.png` | 1672×941 RGB | Prepainted arena |

The request sizes below are generation targets, not the actual output sizes. The first Rumi 4×4 attempt had crowded gutters and is not shipped or loaded. The final sheet was generated from that intermediate character reference, itself based on the original direction board. The playable art uses no per-pixel background-removal or creative editing script.

Total transfer size: 6,057,181 bytes (5.78 MiB). Combined RGBA pixel storage: 18,873,536 bytes (18.0 MiB), excluding canvas backing stores, browser caches and compositor resources.

## Final prompt set

### Rumi revision 2

Reference: the first generated Rumi character/action sheet, matching the original direction board.

> Create a NEW production animation atlas of this EXACT adult anime female sword hunter, matching her beautiful face, long purple braid, black and gold sleeveless clothing and purple waistcloth, detailed painted anime rendering. Fix the layout problems of the reference: every figure including her ENTIRE sword MUST fit wholly inside its individual cell with at least 18% cell margin on ALL FOUR SIDES. Square canvas, transparent RGBA, no text, no grid lines, no background. STRICT 3 columns by 3 rows, nine independent full-body drawings, on a mathematically even grid. Character height just 62% of each cell; weapon never gets within 12% of cell edge. All characters face screen RIGHT at same slightly elevated three-quarter angle, same scale, feet at 82% height, pelvis at horizontal center of each cell. Row 1: idle with sword low; run contact left; run contact right. Row 2: light attack anticipation with sword behind shoulder; full horizontal slash impact to right; recovery guard pose. Row 3: heavy two-handed overhead windup; heavy downstrike with knees bent; heavy recovery low guard. All heads and all boots and ENTIRE swords visible! Do NOT fill each cell edge to edge: generous empty transparent gutters are essential for slicing frames. Character anatomy and outfit consistency, clean alpha, no glow clouds or large effects. Draw the sword shorter if needed to ensure every figure safely fits in its cell. This is actual gameplay art, not a collage or concept board. Preserve excellent detailed anime face and outfit.

### Night market

Reference: original direction board.

> Use case: stylized-concept. Asset type: actual playable 2D battle arena background. Match the attached premium hand-painted anime Seoul night-market atmosphere, graphite navy architecture, warm amber shops, restrained purple/teal neon, violet spirit gate. Wide landscape 16:9, target1920x1080. Camera fixed elevated oblique view looking down about40 degrees at a spacious square combat courtyard, NO horizon, no vanishing-point street canyon. This is for a flat 2D beat-em-up with sprites moving on the floor. Top28% contains beautiful detailed Korean shopfronts, tiled roofs, hanging warm lanterns, stairs leading to a purple circular spirit gate at topcenter. Sideedges contain modest marketarchitecture/plants. Lower72% must be a CONTINUOUS OPEN stone combat floor, no tables, people, enemies, vehicles, obstacles, foregroundarchitecture or tall props in this space. All environment depth and lighting prepainted. Floor notemptyflat: refined worn charcoal stone tiles, subtle arcane ring engraved center, delicate reflected shop colors on damp edges, clearly readable lowcontrastcenter. The floor extends cleanly to bottomedge. Balanced editorial illustrated anime production finish, rich handpainted texture but clear game readability. Sharp brush-defineddetails, restrained emissivehighlights, realistic-enough perspective ofbuildings but flattenedorthographicgameprojection. No text labels, no HUD, no logos, no decorativeborder, no characters, no swordeffects. Use the reference as artstyleonly, do not reproduce its bottomconceptpanels or typography.

### Enemy atlas

Reference: original direction board.

> Use case: stylized-concept. Asset type: production 2D ENEMY ANIMATION SPRITE SHEET for refined anime demon-hunter game. Reference attached only for painted style and skeletal dark-purple demon enemies. Square2048x2048 RGBA, GENUINE TRANSPARENCY. Strict4columns x4rows, each512px cell. 16 fullbody drawings. Eachdrawing safelyinsideitscell with50pxempty margins, allfeet at y440 eachcell, no touchingedges/crossingcells. Elevated threequarter camera facing screenLEFT. No text/grid/background/shadow/VFX. Rows1-2 identical TYPE A lean skeletal oni raider, ivory angular mask, curved dark horns, graphite-violet layered armor, ragged dark cloth, long claw hands, restrained glowing violet eyes. Elegant dangerous proportions NOTcute, NOTchibi, notjoke skeleton. Row1 frames: idle1,idle2,runcontact1,runcontact2; row2 four coherent clawattack frames windup,extension,impact,recovery. Rows3-4 identical TYPE B demon captain: taller broadshoulders, sculpted ivory horned faceplate, darkplum segmented armor withsmall mutedgold trim, purple longwaistsash, long curved blade. Row3 idle1,idle2,walkcontact1,walkcontact2; row4 four swordattack frames preparation,swing,impact,recovery. TypeA height300px eachcell, TypeB height330px eachcell. Samebody/outfit/scale within eachtype. Clearlypainted animelines, detailed facialmask/armor, clear silhouette; samepremium qualityasreference. Readable weaponpositions, noextraneousobjects, no floor, no checkerboard, crispalphaedges. Must be directly usable as sixteen individual sprite frames.
