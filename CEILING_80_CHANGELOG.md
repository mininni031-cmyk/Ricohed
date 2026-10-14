# Ceiling height at 80%

Base: RICOCHET v2.6.1, six reflection panels already scaled to 80%.

- Floor y = -11 and original ceiling y = +11 -> 22m clearance.
- New ceiling y = +6.6 -> 17.6m clearance (80% original).
- Aligned visual roof, shortened x-side walls, boundary frames, glass, and half-court mesh.
- Updated player/cpu capsule ceiling collision and disc ceiling rebound/clamping to the same ROOM.CEILING_Y value.
- Both source modules (src/) and pre-built `ricochet.js` have been patched for direct `index.html` use.
- Six panel locations, angles, widths/heights, jump/wall-kick values, scoring goals and keeper rules unchanged. Gravity shift remains disabled.
- Legacy inactive alternate gravity-shift goal meshes remain at former positions; do not enable gravity-shift without redesigning those alternate goal surfaces.

Checks: JavaScript syntax checks succeeded; ZIP integrity verified. Automated browser play tests could not run because this environment blocks localhost and the Playwright packaged Chromium is absent. Actual gameplay in a browser remains to be verified.
