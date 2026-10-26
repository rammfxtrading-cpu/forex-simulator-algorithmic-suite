/**
 * components/useSesionV1.js — la pantalla v1 en la pagina de sesion (etapa 2 del motor, pieza 6; orden 1-125).
 *
 * Solo con la bandera de cliente encendida y una sesion v1 (lib/sim/v1/bandera.js, modoV1). Si no, v1Ref.current queda
 * en null y la pagina es la de hoy. La pantalla (lib/sim/v1/pantalla.js) se crea EN EL RENDER en que llega la sesion,
 * antes de que usePairData cargue velas: asi el primer onTick ya ve v1Ref y no mira SL/TP, pendientes ni breach.
 * Los hooks de hoy (usePairData, useTradingActions, useChallengeFlow) leen v1Ref y, con ella, mandan comandos y pintan
 * solo lo confirmado. puertos (pruebas): { llama, leeTrades, buscaHija, local, almacenSesion, nuevoId }.
 */
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { modoV1 } from '../lib/sim/v1/bandera'
import { creaPantallaV1, llamaConFetch, lineasDeOrdenes } from '../lib/sim/v1/pantalla'
import { tradesDeSesion } from '../lib/tradesEstables'
import { porColumnas } from '../lib/paginado'
import { avisa } from '../lib/sim/avisos'

// un trade de sim_trades como lo pinta la pagina (la misma forma que la carga de _SessionInner)
export const deFila = t => ({ id: t.id, pair: t.pair, side: t.side, entry: t.entry_price, exit: t.exit_price, lots: t.lots, sl: t.sl_price, tp: t.tp_price,
  rr: t.rr, rrReal: t.rr, pnl: t.pnl, result: t.result, reason: '—',
  openTime: t.opened_at ? Math.floor(new Date(t.opened_at).getTime() / 1000) : null, closeTime: t.closed_at ? Math.floor(new Date(t.closed_at).getTime() / 1000) : null })

export function puertosNavegador(id) {
  return {
    llama: llamaConFetch(supabase),
    leeTrades: async () => { const r = await tradesDeSesion(supabase, id, { ordena: porColumnas([['closed_at', 'asc'], ['id', 'asc']]) }); if (r.error) throw r.error; return (r.data ?? []).map(deFila) },
    buscaHija: async () => { const r = await supabase.from('sim_sessions').select('id').eq('challenge_parent_id', id).limit(1); return r.data?.[0]?.id ?? null },
    local: typeof window !== 'undefined' ? window.localStorage : null,
    almacenSesion: typeof window !== 'undefined' ? window.sessionStorage ?? null : null,
    nuevoId: () => crypto.randomUUID(),
  }
}

export default function useSesionV1({ id, session, pairState, balanceRef, setBalance, setTick, v1Ref, refrescaRetoRef, chartMap = null, puertos = null }) {
  const de = useRef(null)
  const activo = !!session && session.id === id && modoV1(session)
  if (!activo && v1Ref.current) { v1Ref.current = null; de.current = null }
  if (activo && de.current !== id) {
    const p = puertos ?? puertosNavegador(id)
    v1Ref.current = creaPantallaV1({ sessionId: id, sesion: session, usuario: session.user_id, pairState, ...p, avisa,
      alSaldo: n => { if (n == null) return; balanceRef.current = n; setBalance(n) },
      // orden 1-127 (4): con cada cambio, las lineas de las pendientes de cada par en su grafico, como hoy
      alCambio: () => { setTick(t => t + 1); const cm = chartMap?.current; if (cm) for (const [par, ps] of Object.entries(pairState.current)) lineasDeOrdenes(cm[par], ps?.orders ?? []) },
      alReto: () => refrescaRetoRef?.current?.() })
    de.current = id
  }
  const pantalla = activo ? v1Ref.current : null
  useEffect(() => { if (pantalla) pantalla.arranca() }, [pantalla])
  return pantalla
}
