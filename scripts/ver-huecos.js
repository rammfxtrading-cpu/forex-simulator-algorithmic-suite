const fs=require('fs'), path=require('path');
const dir=path.join(__dirname,'..','descarga-2026');
function huecos(pair, year){
  const d=JSON.parse(fs.readFileSync(path.join(dir, pair+'_'+year+'.json'),'utf8'));
  const dias=new Set(d.map(c=>new Date(c.time*1000).toISOString().slice(0,10)));
  const faltan=[];
  const now=new Date();
  for(let m=0;m<12;m++){
    const nd=new Date(Date.UTC(year,m+1,0)).getUTCDate();
    for(let dia=1;dia<=nd;dia++){
      const dt=new Date(Date.UTC(year,m,dia));
      if(dt>now) break;
      const ymd=dt.toISOString().slice(0,10);
      const dow=dt.getUTCDay();
      const esFinde = (dow===0 || dow===6);
      const tiene = dias.has(ymd);
      if(!tiene && !esFinde) faltan.push(ymd+' ('+['dom','lun','mar','mie','jue','vie','sab'][dow]+')');
    }
  }
  console.log(pair+' '+year+': '+(faltan.length?faltan.length+' dias laborables sin datos -> '+faltan.join(', '):'sin huecos en dias de mercado'));
}
huecos('AUDUSD',2025);
huecos('USDJPY',2024);
