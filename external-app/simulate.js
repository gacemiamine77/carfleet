#!/usr/bin/env node
// App externe Node - 5 voitures aléatoires
// Usage: node simulate.js --url http://192.168.0.2:3000 --interval 2
const args = process.argv.slice(2);
const getArg = (k, d) => { const i=args.indexOf(`--${k}`); return i!==-1 ? args[i+1] : d; };
const base = (getArg("url","http://127.0.0.1:3000")).replace(/\/$/,"");
const interval = parseFloat(getArg("interval","2"));
const endpoint = `${base}/api/external/track`;
console.log(`Envoi vers ${endpoint} toutes les ${interval}s`);

const cars = Array.from({length:5},(_,i)=>({carId:`EXT-${i+1}`, lat:36.75+ (Math.random()-0.5)*3, lon:3.04+(Math.random()-0.5)*5, heading: Math.random()*360}));
const session = getArg("session", `external-${Date.now()}`);

async function tick(){
  const payload = cars.map(c=>{
    const speed = 20+Math.random()*50;
    c.heading = (c.heading + (Math.random()-0.5)*50 + 360)%360;
    const distDeg = (speed*interval/3600)/111;
    c.lat += Math.cos(c.heading*Math.PI/180)*distDeg*0.7;
    c.lon += Math.sin(c.heading*Math.PI/180)*distDeg*0.7 / Math.max(0.5, Math.abs(Math.cos(c.lat*Math.PI/180)));
    c.lat = Math.max(32.5, Math.min(37.5, c.lat));
    c.lon = Math.max(-2.5, Math.min(9.0, c.lon));
    return {carId:c.carId, lat:+c.lat.toFixed(5), lon:+c.lon.toFixed(5), speed:+speed.toFixed(1), heading:Math.round(c.heading)};
  });
  try{
    const r = await fetch(endpoint,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({cars:payload, sessionId:session})});
    const t = await r.text();
    console.log(new Date().toLocaleTimeString(), r.status, t.slice(0,120));
  }catch(e){ console.error("Erreur réseau:", e.message); }
}
setInterval(tick, interval*1000);
tick();
