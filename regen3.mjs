import osmtogeojson from "osmtogeojson";
import { promises as fs } from "fs";
const FILTER=`["highway"~"motorway|trunk|primary|secondary|tertiary"]`;
async function fetchBbox(bbox, label){
  const q=`[out:json][timeout:180];(way${FILTER}(${bbox}););out geom;`;
  console.log(`\n[${label}] ${bbox}`);
  for(const ep of ["https://overpass.openstreetmap.fr/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){
    try{
      const r=await fetch(ep,{method:"POST", body:`data=${encodeURIComponent(q)}`, headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json","User-Agent":"car-tracking-algeria/1.0"}, signal:AbortSignal.timeout(180000)});
      console.log(" status",r.status);
      const t=await r.text();
      const j=JSON.parse(t);
      console.log(" elements",j.elements.length);
      if(j.elements.length){
        const gj=osmtogeojson(j);
        const out={type:"FeatureCollection", features: gj.features.map(f=>({type:"Feature", geometry:f.geometry, properties:{name:f.properties?.name, "name:ar":f.properties?.["name:ar"], ref:f.properties?.ref, highway:f.properties?.highway, maxspeed:f.properties?.maxspeed, surface:f.properties?.surface, oneway:f.properties?.oneway, lanes:f.properties?.lanes, maxheight:f.properties?.maxheight, hgv:f.properties?.hgv}}))};
        await fs.mkdir("public/data/algeria-roads",{recursive:true});
        await fs.writeFile(`public/data/algeria-roads/algeria-roads-${label}.geojson`, JSON.stringify(out,null,2));
        console.log(` written ${out.features.length}`);
        return;
      }
    }catch(e){ console.log(" err",e.message)}
  }
  console.log(" no data");
}
// Adrar 01 city-based: Adrar Centre 27.8739,-0.2833 Timimoun 29.25,0.23 Reggane 26.72,-0.17 => 26.54,-0.46,29.43,0.41
await fetchBbox("26.5400,-0.4600,29.4300,0.4100","01");
// Alger 16 city-based: 36.5294,2.6636,36.9674,3.3217
await fetchBbox("36.5294,2.6636,36.9674,3.3217","16");
// Mostaganem 27 city-based: 35.5700,-0.0900,36.2700,0.6500
await fetchBbox("35.5700,-0.0900,36.2700,0.6500","27");
console.log("done");
