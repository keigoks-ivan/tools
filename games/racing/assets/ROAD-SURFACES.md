# Road and pavement materials

The asphalt and concrete scans are the existing Poly Haven CC0 assets recorded in
[surfaces/sources.json](surfaces/sources.json). Their diffuse, OpenGL normal and
roughness maps are unchanged. No additional downloaded images or GPU textures are
allocated for the repair, compaction or curb-joint effects.

`road-surface.mjs` adds original metre-scale shader fields to the photographed
aggregate. Repairs are approximately 0.56–2.1 m across and 1.8–6 m along the road,
with narrow, irregular seams and restrained diffuse/roughness differences. City
traffic lanes have discontinuous paired tyre compaction at their actual lane
centres. The four scenic circuits retain their original racing-line wear and do
not acquire traffic-lane compaction. Longitudinal fields repeat across the lap seam.

Cities use a muted grey concrete tint, preserving the scans' fine surface detail.
The raised curb is original geometry for the adapted closed racing route: a
140 mm rise above asphalt, a 320 mm footprint, bevelled edges and approximately
914 mm shaded joints. Its texture coordinates follow developed profile metres
and actual circuit distance. It is not a claim that all represented cities use
identical surveyed curb dimensions. Taipei side-street openings remain open.

The two curb ribbons share one mesh, one concrete material clone and the existing
concrete maps. Curvature-adaptive sampling places extra detail on bends. Across
the nineteen city circuits the added mesh is 5,960–7,800 triangles on phone and
11,720–15,600 on desktop, with one extra draw call and no extra textures. Build-time
edge checks keep the ribbon outside asphalt; there are no additional physical
collision objects or guardrail changes.

Road and curb shader extensions call the preceding `onBeforeCompile` hook and
extend its program cache key. Rain darkens asphalt while city aggregate retains a
rough, broad reflection; the original scenic wetness response is preserved. Curb
tops participate in the existing slope-aware winter snow shader. Season disposal
restores dry material state and shader hooks without disposing borrowed scans.
World resource capture owns the selected scene's geometry/materials and disposes
shared texture references once.

Validation: `world-road-curbs.test.mjs`, `world-road.test.mjs`,
`road-surface.test.mjs` and `seasons.test.mjs` check all 38 city/tier curb variants,
triangle interiors at bends, inward/top-facing normals, metre coordinates, Taipei
openings, resource budgets, shared-map disposal, and wet/winter shader composition.
