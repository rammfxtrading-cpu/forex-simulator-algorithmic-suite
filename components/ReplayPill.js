/**
 * components/ReplayPill.js — píldora flotante de replay (Fase 7, Corte C, s59).
 * Extraída 1:1 de components/_SessionInner.js (baseline 2511, md5 b3433273): drag de la píldora,
 * play/pausa, paso, barra de progreso con seek (onSeek viene del padre: handleSeek), velocidades
 * y Go to. Única transformación: el onClick inline del seek pasa a la prop onSeek, línea a línea.
 */

import { s } from './sessionStyles'
import { SPEED_OPTS } from '../lib/sessionUi'

export default function ReplayPill({pillPos,setPillPos,pillDragRef,isPlaying,challengeLocked,dataReady,handlePlayPause,handleStep,progress,onSeek,speed,handleSpeed,gotoMiss,gotoOpen,setGotoOpen,gotoDir,setGotoDir,handleGoTo}){
  return(
      <div
        style={{...s.replayPill,
          ...(pillPos.x!=null?{left:pillPos.x,top:pillPos.y,transform:'none'}:{})
        }}
        onMouseDown={e=>{
          if(e.target.tagName==='BUTTON'||e.target.closest('button')) return
          const rect=e.currentTarget.getBoundingClientRect()
          pillDragRef.current={offX:e.clientX-rect.left,offY:e.clientY-rect.top}
          const onMove=ev=>{
            setPillPos({x:ev.clientX-pillDragRef.current.offX,y:ev.clientY-pillDragRef.current.offY})
          }
          const onUp=()=>{
            pillDragRef.current=null
            window.removeEventListener('mousemove',onMove)
            window.removeEventListener('mouseup',onUp)
          }
          window.addEventListener('mousemove',onMove)
          window.addEventListener('mouseup',onUp)
          e.preventDefault()
        }}
      >
        <button
          style={{
            ...s.pillPlay,
            ...(isPlaying?s.pillPause:{}),
            ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
          }}
          title={challengeLocked ? 'Sesión terminada — replay congelado' : undefined}
          onClick={handlePlayPause}
          disabled={!dataReady||challengeLocked}>
          {isPlaying
            ?<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>
            :<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
          }
        </button>
        <button
          style={{
            ...s.pillBtn,
            ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
          }}
          onClick={handleStep}
          disabled={!dataReady||challengeLocked}
          title={challengeLocked ? 'Sesión terminada — replay congelado' : 'Avanzar vela'}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="3" height="16"/></svg>
        </button>
        <div style={s.pillDivider}/>
        <div
          style={{
            ...s.pillProgress,
            ...(challengeLocked ? {opacity:0.4, cursor:'not-allowed', pointerEvents:'none'} : {}),
          }}
          title={challengeLocked ? 'Sesión terminada' : `${progress}% — clic para saltar`}
          onClick={challengeLocked ? undefined : onSeek}>
          <div style={{...s.pillProgressFill,width:`${progress}%`}}/>
        </div>
        <div style={s.pillDivider}/>
        <div style={{...s.speedRow, ...(challengeLocked ? {opacity:0.35, pointerEvents:'none'} : {})}}>
          {SPEED_OPTS.map(o=>(
            <button key={o.v} style={{...s.speedBtn,...(speed===o.v?s.speedActive:{})}} onClick={()=>handleSpeed(o.v)}>{o.l}</button>
          ))}
        </div>
        <div style={s.pillDivider}/>
        <div style={{position:'relative',flexShrink:0}}>
          <button
            style={{
              ...s.gotoBtn,
              ...(gotoMiss?s.gotoMiss:{}),
              ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
            }}
            disabled={!dataReady||challengeLocked}
            title={challengeLocked ? 'Sesión terminada — replay congelado' : (gotoMiss ? 'Sin próxima apertura en el dataset' : 'Saltar a la próxima apertura de sesión')}
            onClick={(ev)=>{const r=ev.currentTarget.getBoundingClientRect();setGotoDir(r.top<140?'down':'up');setGotoOpen(v=>!v)}}>
            Go to
          </button>
          {gotoOpen&&(
            <div style={{...s.gotoDd,...(gotoDir==='down'?s.gotoDdDown:{})}}>
              <button style={s.ddItem} onClick={()=>handleGoTo('asia')}>Asia</button>
              <button style={s.ddItem} onClick={()=>handleGoTo('london')}>Londres</button>
              <button style={s.ddItem} onClick={()=>handleGoTo('nyam')}>NY</button>
            </div>
          )}
        </div>
      </div>
  )
}
