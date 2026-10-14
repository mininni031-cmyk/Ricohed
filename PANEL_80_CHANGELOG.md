# Reflector panel size adjustment (80%)

All six fixed reflective panels have their **width and height multiplied by 0.8**. Thickness (0.16m), origin, orientation, count, collision logic, and gameplay parameters are unchanged.

| Panel | Original width × height | Updated width × height |
|---|---|---|
| C1 | 3.2 × 1.8m | 2.56 × 1.44m |
| C2 | 3.4 × 1.6m | 2.72 × 1.28m |
| C3 | 1.6 × 1.2m | 1.28 × 0.96m |
| K1 | 2.8 × 1.8m | 2.24 × 1.44m |
| K2 | 4.6 × 1.4m | 3.68 × 1.12m |
| K3 | 0.9 × 3.0m | 0.72 × 2.4m |

Both `src/config.js` and the distributable `ricochet.js` were updated. The game constructs displayed geometry and physics OBB colliders from the same panel `size` entries, preserving visual/collision sync.
