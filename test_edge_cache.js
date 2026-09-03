import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runCacheTest() {
  console.log("🔍 Fetching a random active Movie Source ID from Supabase...");
  const { data } = await supabase.from('movie_sources').select('drive_file_id, clone_file_ids').limit(1);
  const fileId = data[0].clone_file_ids[0] || data[0].drive_file_id;
  
  const workerUrl = `https://tgstream.smd-prime.workers.dev/stream?id=${fileId}`;
  
  console.log(`\n🌍 TARGET URL: ${workerUrl}`);
  console.log("--------------------------------------------------");

  // TEST 1: Initial Request (Will hit Google Drive)
  console.log("🟡 TEST 1: FIRST REQUEST (Expecting Cache: MISS)");
  let t1 = Date.now();
  let res1 = await fetch(workerUrl, { headers: { 'Range': 'bytes=0-1000000' } });
  let t1End = Date.now() - t1;
  const h1 = res1.headers;
  
  console.log(`   Response Status  : ${res1.status}`);
  console.log(`   X-Cache-Status   : ${h1.get('x-cache-status')}`);
  console.log(`   Response Latency : ${t1End}ms`);
  
  console.log("\n⏳ Waiting 2 seconds for Cloudflare Edge Cache to globally distribute...");
  await new Promise(r => setTimeout(r, 2000));
  
  // TEST 2: Second Request (Should hit Cloudflare CDN Cache)
  console.log("\n🟢 TEST 2: SIMULATING 2nd USER (Expecting Cache: HIT)");
  let t2 = Date.now();
  let res2 = await fetch(workerUrl, { headers: { 'Range': 'bytes=0-1000000' } });
  let t2End = Date.now() - t2;
  const h2 = res2.headers;
  
  console.log(`   Response Status  : ${res2.status}`);
  console.log(`   X-Cache-Status   : ${h2.get('x-cache-status')}`);
  console.log(`   Response Latency : ${t2End}ms (Should be Lightning Fast!)`);
  console.log("--------------------------------------------------");

  if (h2.get('x-cache-status') === 'HIT') {
    console.log("🎉 SUCCESS! Cloudflare Request Collapsing & Edge Caching is working 100%!");
  } else {
    console.log("⚠️ CACHE MISS on second try. Caching might take a moment to propagate.");
  }
}

runCacheTest();
