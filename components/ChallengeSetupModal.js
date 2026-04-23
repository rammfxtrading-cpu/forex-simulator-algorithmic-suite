// components/ChallengeSetupModal.js
// ────────────────────────────────────────────────────────────────────────────
// Modal para crear un nuevo Propfirms Challenge.
// Diseño estilo FTMO: tipo arriba, tamaño en medio, resumen y CTA abajo.
// Una sola vista (no pasos), overlay semi-transparente que deja ver la red
// cósmica del dashboard.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { CHALLENGES, ACCOUNT_SIZES, formatAccountSize, getPhaseTarget } from '../lib/challengeRules'

const RECOMMENDED_TYPE = '2F'
const POPULAR_SIZE = 100000

export default function ChallengeSetupModal({ open, onClose }) {
  const router = useRouter()
  const [type, setType] = useState(RECOMMENDED_TYPE)
  const [size, setSize] = useState(POPULAR_SIZE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const targetPct = useMemo(() => getPhaseTarget(type, 1), [type])
  const targetUSD = useMemo(() => Math.round((size * (targetPct || 0)) / 100), [size, targetPct])

  if (!open) return null

  async function handleStart() {
    setLoading(true)
    setError('')
    try {
      // Defaults invisibles para el alumno:
      // - pair: EURUSD (cambia dentro del chart si quiere)
      // - timeframe: M15
      // - date_from: hoy - 6 meses
      // - date_to: hoy
      const today = new Date()
      const from = new Date(today)
      from.setMonth(from.getMonth() - 6)
      const iso = (d) => d.toISOString().slice(0, 10)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')

      const res = await fetch('/api/challenge/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          challenge_type: type,
          capital: size,
          pair: 'EURUSD',
          timeframe: 'M15',
          date_from: iso(from),
          date_to: iso(today),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudo crear el challenge')
      }
      router.push(`/session/${json.session.id}`)
    } catch (e) {
      setError(e.message || 'Error inesperado')
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.title}>Nuevo Propfirms Challenge</div>
            <div style={styles.subtitle}>Elige tu challenge y el tamaño de cuenta</div>
          </div>
          <div style={styles.close} onClick={onClose}>×</div>
        </div>

        {/* Tipo de challenge */}
        <div style={styles.sectionLabel}>Tipo de Challenge</div>
        <div style={styles.typeGrid}>
          {Object.values(CHALLENGES).map((cfg) => {
            const active = type === cfg.code
            const recommended = cfg.code === RECOMMENDED_TYPE
            return (
              <div
                key={cfg.code}
                style={{ ...styles.typeCard, ...(active ? styles.typeCardActive : {}) }}
                onClick={() => setType(cfg.code)}
              >
                {recommended && (
                  <div style={styles.badgeRecommended}>RECOMENDADO</div>
                )}
                <div style={styles.typeName}>{cfg.name}</div>
                <div style={styles.typeDesc}>{cfg.description}</div>
                <div style={styles.typeRules}>
                  <div>
                    {cfg.targets_pct.length === 1 ? 'Target: ' : 'Targets: '}
                    <span style={styles.ruleGreen}>
                      {cfg.targets_pct.map((p) => `+${p}%`).join(' / ')}
                    </span>
                  </div>
                  <div>DD diario: <span style={styles.ruleOrange}>{cfg.dd_daily_pct}%</span></div>
                  <div>DD total: <span style={styles.ruleOrange}>{cfg.dd_total_pct}%</span></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Tamaño de cuenta */}
        <div style={styles.sectionLabel}>Tamaño de Cuenta</div>
        <div style={styles.sizeGrid}>
          {ACCOUNT_SIZES.map((s) => {
            const active = size === s
            const popular = s === POPULAR_SIZE
            return (
              <div
                key={s}
                style={{ ...styles.sizeCard, ...(active ? styles.sizeCardActive : {}) }}
                onClick={() => setSize(s)}
              >
                {popular && <div style={styles.badgePopular}>POPULAR</div>}
                <div style={styles.sizeValue}>{formatAccountSize(s)}</div>
              </div>
            )
          })}
        </div>

        {/* Resumen */}
        <div style={styles.summary}>
          <div style={styles.summaryLabel}>Resumen</div>
          <div style={styles.summaryRow}>
            <div style={styles.summaryMain}>
              {CHALLENGES[type]?.name} · {formatAccountSize(size)}
            </div>
            <div style={styles.summaryTarget}>
              Target fase 1: <span style={styles.ruleGreen}>+${targetUSD.toLocaleString('en-US')}</span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* CTA */}
        <button
          style={{ ...styles.cta, ...(loading ? styles.ctaDisabled : {}) }}
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? 'Creando challenge...' : 'Iniciar Challenge →'}
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Estilos inline. Coinciden con el look del dashboard/admin (azules profundos,
// blur, fuentes Montserrat).
// ────────────────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    width: 640,
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#041530',
    border: '1px solid #0d2040',
    borderRadius: 12,
    padding: '24px 28px',
    color: '#ffffff',
    fontFamily: "'Montserrat', sans-serif",
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
  close: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    padding: '0 6px',
    lineHeight: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 8,
    marginBottom: 20,
  },
  typeCard: {
    background: 'rgba(3,15,32,0.8)',
    border: '1px solid #0d2040',
    borderRadius: 10,
    padding: '14px 12px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all .15s',
  },
  typeCardActive: {
    background: 'rgba(30,144,255,0.12)',
    border: '2px solid #1E90FF',
    padding: '13px 11px',
  },
  typeName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#ffffff',
    marginBottom: 2,
  },
  typeDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 10,
  },
  typeRules: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 1.55,
  },
  ruleGreen: { color: '#22c55e', fontWeight: 600 },
  ruleOrange: { color: '#f97316' },
  badgeRecommended: {
    position: 'absolute',
    top: -9,
    right: 10,
    background: '#1E90FF',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 10,
    letterSpacing: 0.5,
  },
  sizeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
    marginBottom: 20,
  },
  sizeCard: {
    background: 'rgba(3,15,32,0.8)',
    border: '1px solid #0d2040',
    borderRadius: 8,
    padding: '12px 6px',
    textAlign: 'center',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all .15s',
  },
  sizeCardActive: {
    background: 'rgba(30,144,255,0.12)',
    border: '2px solid #1E90FF',
    padding: '11px 5px',
  },
  sizeValue: {
    fontSize: 14,
    fontWeight: 700,
  },
  badgePopular: {
    position: 'absolute',
    top: -9,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1E90FF',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 10,
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  },
  summary: {
    background: 'rgba(3,15,32,0.6)',
    border: '1px solid #0d2040',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  summaryMain: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 600,
  },
  summaryTarget: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },
  errorBox: {
    background: 'rgba(239,83,80,0.12)',
    border: '1px solid rgba(239,83,80,0.5)',
    color: '#ef5350',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 12,
  },
  cta: {
    width: '100%',
    background: '#1E90FF',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all .15s',
  },
  ctaDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
}
