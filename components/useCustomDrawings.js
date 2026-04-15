/**
 * useCustomDrawings.js - Central store for custom drawings (Text, Ruler)
 * All drawings stored as absolute (time, price) coordinates
 */
import { useState, useCallback, useRef } from 'react'

export const DRAWING_TYPES = {
  TEXT:  'text',
  RULER: 'ruler',
}

let _id = 0
const genId = () => `cd_${++_id}_${Date.now()}`

export default function useCustomDrawings() {
  const [drawings, setDrawings] = useState([])
  const drawingsRef = useRef([])

  const setAll = useCallback((next) => {
    drawingsRef.current = next
    setDrawings(next)
  }, [])

  const addDrawing = useCallback((type, points, metadata = {}) => {
    const drawing = { id: genId(), type, points, metadata }
    const next = [...drawingsRef.current, drawing]
    drawingsRef.current = next
    setDrawings(next)
    return drawing
  }, [])

  const updateDrawing = useCallback((id, patch) => {
    const next = drawingsRef.current.map(d => d.id === id ? { ...d, ...patch } : d)
    drawingsRef.current = next
    setDrawings(next)
  }, [])

  const removeDrawing = useCallback((id) => {
    const next = drawingsRef.current.filter(d => d.id !== id)
    drawingsRef.current = next
    setDrawings(next)
  }, [])

  const removeAll = useCallback(() => {
    drawingsRef.current = []
    setDrawings([])
  }, [])

  const toJSON = useCallback(() => JSON.stringify(drawingsRef.current), [])

  const fromJSON = useCallback((json) => {
    try {
      const parsed = JSON.parse(json)
      if (Array.isArray(parsed)) {
        drawingsRef.current = parsed
        setDrawings(parsed)
      }
    } catch {}
  }, [])

  return { drawings, drawingsRef, addDrawing, updateDrawing, removeDrawing, removeAll, toJSON, fromJSON }
}
