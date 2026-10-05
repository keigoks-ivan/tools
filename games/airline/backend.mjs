// One-line switch between the real model and the mock.
// REAL model (default):
export * from './data.mjs?v=16';
export * from './model.mjs?v=16';
// MOCK (comment out the two lines above and uncomment this one):
// export * from './mock-model.mjs';

// 資料來源 page data (sources.mjs: SOURCES, DESIGN_VALUES, VERIFICATION)
export { SOURCES, DESIGN_VALUES, VERIFICATION, AIRCRAFT_REFERENCES } from './sources.mjs?v=16';
