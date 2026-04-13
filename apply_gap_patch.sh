#!/bin/bash
cd ~/Desktop/forex-simulator-algorithmic-suite

# ── PATCH 1: SegmentRenderer.draw in core ────────────────────────────────────
python3 << 'PYEOF'
with open('node_modules/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js', 'r') as f:
    content = f.read()

old = """                if (start.x === end.x) {
                    drawVerticalLine(ctx, start.x, start.y, end.y);
                }
                else if (start.y === end.y) {
                    drawHorizontalLine(ctx, start.y, start.x, end.x);
                }
                else {
                    drawLine(ctx, start.x, start.y, end.x, end.y, lineStyle);
                }
            }
        });
    }
    /**
     * Performs a hit test along the entire rendered path"""

new = """                // TEXT GAP: if textGap provided, draw two segments with a gap
                if (this._data.textGap) {
                    const g = this._data.textGap;
                    const gL = g.cx - g.halfW - 1;
                    const gR = g.cx + g.halfW + 1;
                    const dxL = end.x - start.x;
                    if (Math.abs(dxL) > 0.1) {
                        const t1 = (gL - start.x) / dxL;
                        const t2 = (gR - start.x) / dxL;
                        if (t1 > 0.01) {
                            const p1x = start.x + t1*dxL;
                            const p1y = start.y + t1*(end.y-start.y);
                            drawLine(ctx, start.x, start.y, p1x, p1y, lineStyle);
                        }
                        if (t2 < 0.99) {
                            const p2x = start.x + t2*dxL;
                            const p2y = start.y + t2*(end.y-start.y);
                            drawLine(ctx, p2x, p2y, end.x, end.y, lineStyle);
                        }
                    } else {
                        // Vertical/horizontal fallback
                        if (start.x === end.x) drawVerticalLine(ctx, start.x, start.y, end.y);
                        else drawHorizontalLine(ctx, start.y, start.x, end.x);
                    }
                } else if (start.x === end.x) {
                    drawVerticalLine(ctx, start.x, start.y, end.y);
                }
                else if (start.y === end.y) {
                    drawHorizontalLine(ctx, start.y, start.x, end.x);
                }
                else {
                    drawLine(ctx, start.x, start.y, end.x, end.y, lineStyle);
                }
            }
        });
    }
    /**
     * Performs a hit test along the entire rendered path"""

if old in content:
    content = content.replace(old, new)
    print("CORE: SegmentRenderer gap patch applied")
else:
    print("CORE: ERROR - text not found")

with open('node_modules/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js', 'w') as f:
    f.write(content)
PYEOF

# ── PATCH 2: LineToolTrendLinePaneView._updateImpl in lines ──────────────────
python3 << 'PYEOF'
with open('node_modules/lightweight-charts-line-tools-lines/dist/lightweight-charts-line-tools-lines.js', 'r') as f:
    content = f.read()

old = """        this._segmentRenderer.setData({
            points: segmentPoints,"""

new = """        // Calculate text gap if text has a value
        let textGap = null;
        if (options.text && options.text.value) {
            // Estimate text width based on font size and text length
            const fontSize = options.text.font?.size || 12;
            const textLen = options.text.value.length;
            const estimatedHalfW = (fontSize * 0.55 * textLen) / 2 + 1;
            // Get midpoint of the segment
            const [pt0, pt1] = this._points;
            const cx = (pt0.x + pt1.x) / 2;
            const cy = (pt0.y + pt1.y) / 2;
            textGap = { cx, cy, halfW: estimatedHalfW, halfH: fontSize / 2 };
        }
        this._segmentRenderer.setData({
            points: segmentPoints,
            textGap,"""

if old in content:
    content = content.replace(old, new)
    print("LINES: textGap patch applied")
else:
    print("LINES: ERROR - text not found")

with open('node_modules/lightweight-charts-line-tools-lines/dist/lightweight-charts-line-tools-lines.js', 'w') as f:
    f.write(content)
PYEOF

# ── Save patches with patch-package ─────────────────────────────────────────
npx patch-package lightweight-charts-line-tools-core
npx patch-package lightweight-charts-line-tools-lines

echo "All patches saved!"
