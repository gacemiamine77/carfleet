import osmtogeojson from "osmtogeojson";
import { promises as fs } from "fs";
import path from "path";
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
// City-based bboxes for dense northern wilayas (from NORTH_ALGERIA_CITIES)
const CITY_BBOX = {
  "09": "36.2900,2.6400,36.7500,3.0900",
  "10": "36.1800,3.4100,36.7400,4.0800",
  "15": "36.5300,3.8600,36.9200,4.5200",
  "18": "36.2700,5.5800,37.0000,6.4400",
  "19": "35.5800,4.8100,36.7800,6.0100",
  "20": "34.6300,-0.0500,35.4300,0.7500",
  "21": "36.5500,6.3000,37.1500,7.3000",
  "22": "34.5800,-1.2300,35.7800,-0.0300",
  "23": "36.6000,7.1500,37.1000,8.3500",
  "24": "35.8600,6.8200,37.0600,8.0200",
  "25": "35.7600,6.0100,36.9600,7.2100",
  "26": "35.6600,2.1500,36.8600,3.3500",
  "28": "35.0200,3.9400,36.3000,5.1400",
  "29": "34.7900,-0.4600,35.9900,0.7400",
  "30": "31.3400,4.7200,32.5400,5.9200",
  "31": "35.0900,-1.2300,36.2900,-0.0300",
  "32": "33.0800,0.4100,34.2800,1.6100",
  "33": "25.8800,7.8600,27.0800,9.0600",
  "34": "35.4700,4.1600,36.6700,5.3600",
  "35": "36.1600,2.8700,37.3600,4.0700",
  "36": "36.1600,7.7100,37.3600,8.9100",
  "37": "27.0700,-8.7400,28.2700,-7.5400",
  "38": "35.0000,1.2100,36.2000,2.4100",
  "39": "32.7500,6.2600,33.9500,7.4600",
  "40": "34.8300,6.5400,36.0300,7.7400",
  "41": "35.6800,7.3500,36.8800,8.5500",
  "42": "35.9800,1.8400,37.1800,3.0400",
  "43": "35.8500,5.6600,37.0500,6.8600",
  "44": "35.6600,1.3600,36.8600,2.5600",
  "45": "32.6600,-0.9100,33.8600,0.2900",
  "46": "34.6900,-1.7400,35.8900,-0.5400",
  "47": "31.8900,3.0700,33.0900,4.2700",
  "48": "35.1300,-0.0500,36.3300,1.1500",
};
const CODES = Array.from({length:58},(_,i)=> String(i+1).padStart(2,"0"));
async function fetchOne(code){
  const file = `${CACHE_DIR}/algeria-roads-${code}.geojson`;
  try{ await fs.stat(file); console.log(`${code} skip`); return; }catch{}
  const bbox = CITY_BBOX[code] || `${(WILAYA_CENTERS[code][0]-0.6).toFixed(4)},${(WILAYA_CENTERS[code][1]-0.6).toFixed(4)},${(WILAYA_CENTERS[code][0]+0.6).toFixed(4)},${(WILAYA_CENTERS[code][1]+0.6).toFixed(4)}`;
  const q=`[out:json][timeout:180];(way${FILTER}(${bbox}););out geom;`;
  console.log(`\n[${code}] ${bbox}`);
  let data=null;
  for(const ep of ["https://overpass.openstreetmap.fr/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){
    try{
      const r=await fetch(ep,{method:"POST", body:`data=${encodeURIComponent(q)}`, headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json","User-Agent":"car-tracking-algeria/1.0"}, signal:AbortSignal.timeout(180000)});
      if(!r.ok){ console.log(` ${ep} ${r.status}`); continue; }
      const t=await r.text();
      data=JSON.parse(t);
      if(data.elements?.length){ console.log(` ${ep} ok ${data.elements.length}`); break; }
    }catch(e){ console.log(` ${ep} err ${e.message}`)}
  }
  if(!data?.elements?.length){ console.log(`[${code}] no data`); return; }
  const gj=(await import("osmtogeojson")).default(data);
  const out={type:"FeatureCollection", features: gj.features.map(f=>({type:"Feature", geometry:f.geometry, properties:{name:f.properties?.name, highway:f.properties?.highway, maxspeed:f.properties?.maxspeed, ref:f.properties?.ref}}))};
  await fs.mkdir(CACHE_DIR,{recursive:true});
  await fs.writeFile(file, JSON.stringify(out,null,2));
  console.log(`[${code}] written ${out.features.length}`);
  await new Promise(r=>setTimeout(r,1000));
}
for(const c of CODES) await fetchOne(c);
console.log("Done");
