// Container health probe: exits 0 when the server answers and the database is readable.
const port=process.env.PORT||3000;
try{const res=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(4000)});process.exit(res.ok?0:1)}catch{process.exit(1)}
