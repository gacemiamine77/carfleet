import osmtogeojson from "osmtogeojson";
import { promises as fs } from "fs";

const WILAYA_CENTERS = {
  "01": [27.87, -0.28], "02": [36.16, 1.33], "03": [33.80, 2.86], "04": [35.87, 7.11], "05": [35.55, 6.17], "06": [36.75, 5.05], "07": [34.84, 5.72], "08": [31.61, -2.21],
  "09": [36.47, 2.82], "10": [36.37, 3.90], "11": [22.78, 5.52], "12": [35.40, 8.12], "13": [34.88, -1.31], "14": [35.37, 1.31], "15": [36.71, 4.04], "16": [36.75, 3.04],
  "17": [34.67, 3.26], "18": [36.82, 5.76], "19": [36.18, 5.41], "20": [34.83, 0.15], "21": [36.87, 6.90], "22": [35.18, -0.63], "23": [36.89, 7.75], "24": [36.46, 7.42],
  "25": [36.36, 6.61], "26": [36.26, 2.75], "27": [35.93, 0.08], "28": [35.70, 4.54], "29": [35.39, 0.14], "30": [31.94, 5.32], "31": [35.69, -0.63], "32": [33.68, 1.01],
  "33": [26.48, 8.46], "34": [36.07, 4.76], "35": [36.76, 3.47], "36": [36.76, 8.31], "37": [27.67, -8.14], "38": [35.60, 1.81], "39": [33.35, 6.86], "40": [35.43, 7.14],
  "41": [36.28, 7.95], "42": [36.58, 2.44], "43": [36.45, 6.26], "44": [36.26, 1.96], "45": [33.26, -0.31], "46": [35.29, -1.14], "47": [32.49, 3.67], "48": [35.73, 0.55],
  "49": [29.25, 0.23], "50": [21.32, 0.95], "51": [34.43, 5.06], "52": [30.13, -2.17], "53": [27.19, 2.48], "54": [19.57, 5.77], "55": [33.11, 6.06], "56": [24.55, 9.48],
  "57": [33.96, 5.92], "58": [30.58, 2.88],
};
const FILTER = `["highway"~"motorway|trunk|primary|secondary|tertiary"]`;
const CACHE_DIR = "public/data/algeria-roads";
const CODES = Array.from({length:58},(_,i)=> String(i+1).padStart(2,"0"));

async function fetchOne(code){
  const file = `${CACHE_DIR}/algeria-roads-${code}.geojson`;
  try{ await fs.stat(file); console.log(`${code} skip cached`); return; }catch{}
  const c = WILAYA_CENTERS[code];
  const bbox = `${(c[0]-0.6).toFixed(4)},${(c[1]-0.6).toFixed(4)},${(c[0]+0.6).toFixed(4)},${(c[1]+0.6).toFixed(4)}`;
  const q=`[out:json][timeout:180];(way${FILTER}(${bbox}););out geom;`;
  console.log(`\n[${code}] ${bbox} ...`);
  let data=null;
  for(const ep of ["https://overpass.openstreetmap.fr/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){
    try{
      const r=await fetch(ep,{method:"POST", body:`data=${encodeURIComponent(q)}`, headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json","User-Agent":"car-tracking-algeria/1.0"}, signal:AbortSignal.timeout(180000)});
      if(!r.ok){ console.log(` ${ep} status ${r.status}`); continue; }
      const t=await r.text();
      data=JSON.parse(t);
      if(data.elements?.length){ console.log(` ${ep} ok ${data.elements.length}`); break; }
    }catch(e){ console.log(` ${ep} err ${e.message}`)}
  }
  if(!data?.elements?.length){ console.log(`[${code}] no data`); return; }
  const gj=osmtogeojson(data);
  const out={type:"FeatureCollection", features: gj.features.map(f=>({type:"Feature", geometry:f.geometry, properties:{name:f.properties?.name, "name:ar":f.properties?.["name:ar"], "name:fr":f.properties?.["name:fr"], ref:f.properties?.ref, int_ref:f.properties?.int_ref, highway:f.properties?.highway, junction:f.properties?.junction, maxspeed:f.properties?.maxspeed, minspeed:f.properties?.minspeed, "maxspeed:forward":f.properties?.["maxspeed:forward"], "maxspeed:backward":f.properties?.["maxspeed:backward"], surface:f.properties?.surface, smoothness:f.properties?.smoothness, tracktype:f.properties?.tracktype, oneway:f.properties?.oneway, lanes:f.properties?.lanes, "lanes:forward":f.properties?.["lanes:forward"], "lanes:backward":f.properties?.["lanes:backward"], width:f.properties?.width, lit:f.properties?.lit, bridge:f.properties?.bridge, tunnel:f.properties?.tunnel, layer:f.properties?.layer, access:f.properties?.access, foot:f.properties?.foot, bicycle:f.properties?.bicycle, motor_vehicle:f.properties?.motor_vehicle, maxheight:f.properties?.maxheight, maxwidth:f.properties?.maxwidth, maxweight:f.properties?.maxweight, hgv:f.properties?.hgv, hazmat:f.properties?.hazmat, goods:f.properties?.goods, stopping:f.properties?.stopping, parking:f.properties?.parking, no_parking:f.properties?.no_parking, no_stopping:f.properties?.no_stopping, "parking:lane:both":f.properties?.["parking:lane:both"], Toll:f.properties?.toll, barrier:f.properties?.barrier, incline:f.properties?.incline}}))};
  await fs.mkdir(CACHE_DIR,{recursive:true});
  await fs.writeFile(file, JSON.stringify(out,null,2));
  console.log(`[${code}] written ${out.features.length}`);
  await new Promise(r=>setTimeout(r,1200));
}
for(const code of CODES){ await fetchOne(code); }
console.log("Done");
