/**
 * components/sessionStyles.js — estilos de la página de sesión (Fase 7, Corte B, s59).
 *
 * Extraído 1:1 de la cola de components/_SessionInner.js (baseline 2942 líneas, md5 3a975a14):
 * objeto s (estilos inline) y css global (reset, spinner, keyframes sp/blink).
 * glass/glassBorder eran código muerto y NO viajan. balVal saneado: tenía
 * fontWeight:700,fontWeight:600 duplicado (ganaba el último, pintaba 600) — queda 600.
 */

export const s={
  root:{display:'block',height:'100vh',background:'#000',fontFamily:"'Montserrat',sans-serif",overflow:'hidden',color:'#fff',position:'relative'},
  bgCanvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},

  // Chart fills everything
  chartWrap:{position:'absolute',top:68,bottom:44,left:0,right:0,overflow:'hidden',zIndex:0},
  chart:{position:'absolute',inset:0,width:'100%',height:'100%'},
  overlay:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,background:'rgba(0,0,0,0.7)',zIndex:10},
  overlayTxt:{fontSize:11,color:'#ffffff',fontWeight:700},

  // Top bar — floating
  topBar:{position:'absolute',top:0,left:0,right:0,zIndex:20,height:40,background:'rgba(10,10,12,0.85)',borderBottom:'1px solid rgba(255,255,255,0.07)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',display:'flex',alignItems:'center',padding:'0 12px',gap:8},
  topLeft:{display:'flex',alignItems:'center',gap:8,flexShrink:0},
  vDiv:{width:1,height:16,background:'rgba(255,255,255,0.1)'},
  sessName:{fontSize:11,fontWeight:700,color:'#ffffff',letterSpacing:0.3},
  tabRow:{display:'flex',alignItems:'center',gap:2,flex:1,overflow:'visible',minWidth:0},
  tab:{display:'flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:6,background:'transparent',flexShrink:0,cursor:'pointer',border:'1px solid transparent'},
  tabActive:{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'},
  tabLabel:{fontSize:11,fontWeight:600,color:'#ffffff',letterSpacing:0.2,display:'flex',alignItems:'center',gap:4},
  tabDot:{width:4,height:4,borderRadius:'50%',background:'#1E90FF',display:'inline-block'},
  tabClose:{background:'none',border:'none',color:'#ffffff',cursor:'pointer',fontSize:9,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  addBtn:{background:'transparent',border:'1px solid rgba(255,255,255,0.12)',color:'#ffffff',width:22,height:22,borderRadius:4,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Montserrat',sans-serif",flexShrink:0},
  dropdown:{position:'fixed',top:40,background:'rgba(4,10,24,0.97)',border:'1px solid rgba(30,144,255,0.3)',borderRadius:10,zIndex:9999,minWidth:130,padding:'4px 0',boxShadow:'0 8px 32px rgba(0,0,0,0.8)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'},
  ddItem:{display:'block',width:'100%',background:'none',border:'none',color:'#ffffff',fontSize:11,fontWeight:600,padding:'8px 14px',cursor:'pointer',textAlign:'left',fontFamily:"'Montserrat',sans-serif"},
  statsRow:{display:'flex',alignItems:'center',gap:4,flexShrink:0},
  fullBtn:{background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,color:'#ffffff',cursor:'pointer',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:4},

  // TF bar
  tfBar:{position:'absolute',top:40,left:0,right:0,zIndex:20,height:28,background:'rgba(10,10,12,0.75)',borderBottom:'1px solid rgba(255,255,255,0.05)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',display:'flex',alignItems:'center',padding:'0 12px',gap:2},
  tfBtn:{background:'none',border:'none',color:'rgba(255,255,255,0.9)',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tfActive:{background:'rgba(255,255,255,0.1)',color:'#ffffff'},
  tsBadge:{fontSize:9,color:'#ffffff',fontWeight:600,padding:'2px 8px',background:'rgba(255,255,255,0.04)',borderRadius:4},
  pxBadge:{fontSize:12,color:'#ffffff',fontWeight:800,padding:'2px 10px',background:'rgba(255,255,255,0.08)',borderRadius:4,marginLeft:6},

  // Bottom bar
  btmBar:{position:'absolute',bottom:0,left:0,right:0,zIndex:20,height:50,background:'rgba(10,10,12,0.85)',borderTop:'1px solid rgba(255,255,255,0.07)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',display:'flex',alignItems:'center',padding:'0 14px',gap:12},
  replayRow:{display:'flex',alignItems:'center',gap:4,flexShrink:0},
  ctrlBtn:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',color:'#ffffff',width:26,height:26,borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'},
  playBtn:{background:'#fff',border:'none',color:'#000',width:30,height:30,borderRadius:'50%',boxShadow:'none'},
  pauseBtn:{background:'rgba(255,255,255,0.6)'},
  speedRow:{display:'flex',gap:0,marginLeft:4},
  speedBtn:{background:'none',border:'none',color:'#ffffff',fontSize:9,fontWeight:700,padding:'3px 5px',cursor:'pointer',borderRadius:3,fontFamily:"'Montserrat',sans-serif"},
  speedActive:{color:'#ffffff',background:'rgba(255,255,255,0.08)'},
  progWrap:{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:60},
  progTrack:{flex:1,height:2,background:'rgba(255,255,255,0.1)',borderRadius:2,overflow:'hidden'},
  progFill:{height:'100%',background:'rgba(255,255,255,0.6)',borderRadius:2,transition:'width .3s linear'},
  progLabel:{fontSize:8,color:'#ffffff',fontWeight:700,width:28,textAlign:'right',flexShrink:0},
  tradeActions:{display:'flex',gap:6,flexShrink:0},
  buyBtn:{background:'#2962FF',border:'none',color:'#fff',borderRadius:6,padding:'6px 18px',fontSize:11,fontWeight:800,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",letterSpacing:0.5},
  sellBtn:{background:'#ef5350',border:'none',color:'#fff',borderRadius:6,padding:'6px 18px',fontSize:11,fontWeight:800,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",letterSpacing:0.5},
  flash:{transform:'scale(0.94)',opacity:0.8},
  toggleRow:{display:'flex',gap:4},
  togBtn:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'#ffffff',borderRadius:5,padding:'4px 10px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",whiteSpace:'nowrap'},
  togOn:{background:'rgba(255,255,255,0.1)',borderColor:'rgba(255,255,255,0.25)',color:'#fff'},
  // Replay pill
  replayPill:{position:'absolute',top:76,left:'50%',transform:'translateX(-50%)',zIndex:25,display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.22)',borderRadius:12,padding:'6px 14px',cursor:'grab',userSelect:'none',backdropFilter:'blur(40px) saturate(220%) brightness(1.1)',WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.1)',boxShadow:'0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3),inset 0 -1px 0 rgba(0,0,0,0.1),0 0 0 0.5px rgba(255,255,255,0.1)'},
  pillBtn:{background:'rgba(255,255,255,0.06)',border:'none',color:'#ffffff',cursor:'pointer',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:7,padding:0},
  pillPlay:{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff',width:32,height:28,borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0},
  pillPause:{background:'rgba(255,255,255,0.1)',borderColor:'rgba(255,255,255,0.2)'},
  pillDivider:{width:1,height:16,background:'rgba(255,255,255,0.1)',margin:'0 4px'},
  gotoBtn:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',color:'#ffffff',cursor:'pointer',height:22,padding:'0 8px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:6,fontSize:9,fontWeight:700,fontFamily:"'Montserrat',sans-serif",flexShrink:0},
  gotoDd:{position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',background:'rgba(4,10,24,0.97)',border:'1px solid rgba(30,144,255,0.3)',borderRadius:10,zIndex:9999,minWidth:110,padding:'4px 0',boxShadow:'0 8px 32px rgba(0,0,0,0.8)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'},
  gotoMiss:{border:'1px solid rgba(255,80,80,0.85)',color:'#ff6060'},
  gotoDdDown:{bottom:'auto',top:'calc(100% + 8px)'},
  pillProgress:{width:100,height:3,background:'rgba(255,255,255,0.1)',borderRadius:2,overflow:'hidden',cursor:'pointer'},
  pillProgressFill:{height:'100%',background:'#2962FF',borderRadius:2,transition:'width .3s linear'},
  // Balance row
  balanceRow:{display:'flex',alignItems:'center',gap:16,flexShrink:0},
  balLbl:{fontSize:10,color:'#ffffff',fontWeight:500},
  balVal:{color:'#ffffff',fontWeight:600},

  // Panels
  panel:{position:'absolute',bottom:50,left:0,right:0,background:'rgba(4,10,24,0.97)',borderTop:'1px solid rgba(30,144,255,0.25)',zIndex:100,maxHeight:240,overflowY:'auto',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'},
  panelHdr:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid rgba(30,144,255,0.15)',position:'sticky',top:0,background:'rgba(4,10,24,0.99)'},
  panelTitle:{fontSize:9,fontWeight:700,color:'#ffffff',letterSpacing:1.5},
  dangerBtn:{background:'rgba(239,83,80,0.08)',border:'1px solid rgba(239,83,80,0.2)',color:'#ef5350',borderRadius:4,padding:'3px 10px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tbl:{width:'100%',borderCollapse:'collapse',fontSize:10},
  tblRow:{borderBottom:'1px solid rgba(255,255,255,0.04)'},
  th:{padding:'4px 12px',textAlign:'left',color:'#ffffff',fontWeight:600,fontSize:8,letterSpacing:1,whiteSpace:'nowrap'},
  td:{padding:'6px 12px',color:'rgba(255,255,255,0.92)',whiteSpace:'nowrap'},
  closeBtn:{background:'none',border:'none',color:'rgba(255,255,255,0.25)',cursor:'pointer',fontSize:11,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  ctxItem:{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',background:'none',border:'none',color:'#ffffff',fontSize:11,fontWeight:600,padding:'9px 14px',cursor:'pointer',fontFamily:"'Montserrat',sans-serif",gap:16},
  iconBtn:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,padding:'4px 7px',cursor:'pointer',color:'#ffffff',display:'flex',alignItems:'center',fontFamily:"'Montserrat',sans-serif"},
}

export const css=`
  *{box-sizing:border-box;margin:0;padding:0}
  body{overflow:hidden;background:#000}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{opacity:0}
  button:not(:disabled):hover{filter:brightness(1.15)}
  button:disabled{opacity:0.3;cursor:not-allowed!important}
  .sp{width:24px;height:24px;border:2px solid rgba(255,255,255,0.1);border-top-color:rgba(255,255,255,0.6);border-radius:50%;animation:sp .6s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
`
