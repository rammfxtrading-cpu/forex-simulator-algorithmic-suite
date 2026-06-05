/**
 * components/SessionTopBar.js — barra superior de la página de sesión (Fase 7, Corte C, s59).
 * Extraída 1:1 de components/_SessionInner.js (baseline 2511, md5 b3433273): back + nombre,
 * pestañas de pares con dropdown de añadir, fullscreen. router via useRouter propio.
 */

import { useRouter } from 'next/router'
import { s } from './sessionStyles'
import { ALL_PAIRS } from '../lib/sessionUi'

export default function SessionTopBar({session,activePairs,activePair,setActivePair,pairState,removePair,addPair,addingPair,setAddingPair}){
  const router = useRouter()
  return(
      <div style={s.topBar}>
        {/* Left: back + session name */}
        <div style={s.topLeft}>
          <button style={s.iconBtn} onClick={()=>router.push('/dashboard')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <div style={s.vDiv}/>
          <span style={s.sessName}>{session?.name||'Sesión'}</span>
        </div>

        {/* Center: pair tabs + add */}
        <div style={s.tabRow}>
          {activePairs.map(pair=>(
            <div key={pair} style={{...s.tab,...(pair===activePair?s.tabActive:{})}}>
              <span style={s.tabLabel} onClick={()=>setActivePair(pair)}>
                {pair}
                {(pairState.current[pair]?.positions?.length>0)&&<span style={s.tabDot}/>}
              </span>
              {activePairs.length>1&&<button style={s.tabClose} onClick={()=>removePair(pair)}>✕</button>}
            </div>
          ))}
          <div style={{position:'relative',flexShrink:0}}>
            <button style={s.addBtn} onClick={()=>setAddingPair(v=>!v)}>＋</button>
            {addingPair&&(
              <div style={s.dropdown}>
                {ALL_PAIRS.filter(p=>!activePairs.includes(p)).map(p=>(
                  <button key={p} style={s.ddItem} onClick={()=>addPair(p)}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: fullscreen */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <button style={s.fullBtn} onClick={()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen()}} title="Pantalla completa">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>
  )
}
