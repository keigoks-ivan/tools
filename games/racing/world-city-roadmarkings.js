import * as THREE from 'three';

// Regional visual conventions applied to adapted, closed racing routes. These
// are not a surveyed reconstruction of every street's traffic restrictions.
export const CITY_ROAD_PROFILES = Object.freeze({
  taipei: { centre: 'double-yellow', lanes: 2 },
  kualalumpur: { centre: 'broken-white', lanes: 3 },
  kobe: { centre: 'single-yellow', lanes: 2 },
  london: { centre: 'broken-white', lanes: 2, edge: 'double-yellow' },
  sydney: { centre: 'double-white', lanes: 2 },
  goldcoast: { centre: 'broken-white', lanes: 2 },
  melbourne: { centre: 'broken-white', lanes: 2 },
  paris: { centre: 'broken-white', lanes: 2 },
  prague: { centre: 'broken-white', lanes: 1 },
  newcastle: { centre: 'broken-white', lanes: 1, edge: 'double-yellow' },
  bangkok: { centre: 'double-yellow', lanes: 2 },
  sanfrancisco: { centre: 'double-yellow', lanes: 1 },
  newyork: { centre: 'double-yellow', lanes: 3 },
  vancouver: { centre: 'double-yellow', lanes: 2 },
  hanoi: { centre: 'single-yellow', lanes: 1 },
  lisbon: { centre: 'broken-white', lanes: 1 },
  marseille: { centre: 'broken-white', lanes: 1 },
  nice: { centre: 'broken-white', lanes: 2 },
  warwick: { centre: 'broken-white', lanes: 1, edge: 'double-yellow' },
});

export function addCityRoadMarkings({track,bake,setFrame,white,yellow}) {
  const profile=CITY_ROAD_PROFILES[track.id];
  // Taipei's junction-aware markings live beside its street openings, signals
  // and scooter waiting boxes; never overlay a second centre-line system.
  if(!profile||track.id==='taipei')return {triangles:0};
  let triangles=0;
  setFrame(0,0,0,0);
  function stripe(start,end,offset,width,mat){
    const steps=Math.max(1,Math.ceil((end-start)/2)),positions=[],indices=[];
    for(let i=0;i<=steps;i++){
      const p=track.sample(start+(end-start)*i/steps);
      for(const r of [offset-width/2,offset+width/2])positions.push(p.x+p.nx*r,p.y+.064,p.z+p.nz*r);
      if(i<steps){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));geometry.setIndex(indices);geometry.computeVertexNormals();
    bake(geometry,mat);triangles+=indices.length/3;
  }
  const half=track.width/2,centreYellow=profile.centre.includes('yellow');
  if(profile.centre==='broken-white'){
    for(let s=4;s<track.length;s+=12)stripe(s,Math.min(s+3,track.length),0,.13,white);
  }else{
    const offsets=profile.centre.startsWith('double')?[-.14,.14]:[0];
    for(const offset of offsets)stripe(0,track.length,offset,.12,centreYellow?yellow:white);
  }
  for(const side of [-1,1]){
    for(let lane=1;lane<profile.lanes;lane++)for(let s=3;s<track.length;s+=12)stripe(s,Math.min(s+3,track.length),side*half*lane/profile.lanes,.12,white);
    if(profile.edge!=='double-yellow')stripe(0,track.length,side*(half-.22),.12,white);
    if(profile.edge==='double-yellow')for(const edge of [half-.50,half-.24])stripe(0,track.length,side*edge,.10,yellow);
  }
  return {triangles};
}
