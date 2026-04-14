import { LineStyle } from 'lightweight-charts';
import { LineToolPaneView, RectangleRenderer, TextRenderer, deepCopy, BoxHorizontalAlignment, BoxVerticalAlignment, merge, PaneCursorType, getToolCullingState, OffScreenState, TextAlignment, BaseLineTool, ensureNotNull, InteractionPhase, Point } from 'lightweight-charts-line-tools-core';

class SimpleCanvasTextRenderer {
    constructor() { this._data = null; }
    setData(data) { this._data = data; }
    draw(target) {
        if (!this._data) return;
        const { topLeft, bottomRight, text, color } = this._data;
        if (!topLeft || !bottomRight || !text) return;
        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        const w = Math.abs(bottomRight.x - topLeft.x);
        const h = Math.abs(bottomRight.y - topLeft.y);
        if (w < 10 || h < 6) return;
        target.useMediaCoordinateSpace((scope) => {
            const ctx = scope.context;
            ctx.save();
            ctx.font = 'bold 11px Montserrat, sans-serif';
            ctx.fillStyle = color || 'rgba(255,255,255,0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            const lines = text.split('\n');
            const lineH = 14;
            const startY = (y + h/2) - ((lines.length - 1) * lineH / 2);
            lines.forEach((line, i) => ctx.fillText(line, x + w/2, startY + i * lineH));
            ctx.restore();
        });
    }
    hitTest() { return null; }
}
// /lightweight-charts-line-tools-long-short-position/src/views/LineToolLongShortPositionPaneView.ts
/**
 * The Pane View for the Long/Short Position tool.
 *
 * **Tutorial Note on Logic:**
 * This view coordinates a complex multi-part visualization:
 * 1. **Risk Rectangle:** Red box defining the loss zone (Entry to Stop).
 * 2. **Reward Rectangle:** Green box defining the profit zone (Entry to Target).
 * 3. **Dynamic Labels:** Two separate text renderers that auto-calculate and display
 *    prices, distances, and R:R ratios based on the current geometry.
 *
 * It manages independent culling for the two halves to optimize performance when zooming.
 */
class LineToolLongShortPositionPaneView extends LineToolPaneView {
    /**
     * Initializes the Position Tool View.
     *
     * @param tool - The specific Long/Short model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(tool, chart, series) {
        // Call the super constructor (LineToolPaneView) to initialize common properties
        super(tool, chart, series);
        // Custom renderers for the tool's components
        /**
         * Internal renderer for the Stop Loss (Risk) rectangle.
         * @protected
         */
        this._riskRenderer = new RectangleRenderer();
        /**
         * Internal renderer for the Profit Target (Reward) rectangle.
         * @protected
         */
        this._rewardRenderer = new RectangleRenderer();
        /**
         * Internal renderer for the text statistics in the Risk zone.
         * @protected
         */
        this._riskLabelRenderer = new TextRenderer();
        /**
         * Internal renderer for the text statistics in the Reward zone.
         * @protected
         */
        this._rewardLabelRenderer = new TextRenderer();
        this._entryLabelRenderer = new TextRenderer();
    }
    /**
     * The core update logic.
     *
     * This method calculates the geometry for both rectangles, performs granular culling,
     * and generates the dynamic text strings for the labels.
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const tool = this._tool;
        const options = tool.options();
        if (!options.visible)
            return;
        // 1. Coordinate Conversion
        // This populates this._points based on tool.points(). 
        // Because we overrode points() in the Model, this will contain [Entry, Stop, VirtualPT]
        // even during the creation/ghosting phase.
        if (!this._updatePoints())
            return;
        // We need at least Entry and Stop (2 points) to draw anything meaningful
        if (this._points.length < 2)
            return;
        // --- CULLING START ---
        // We check visibility for both rectangles independently to support different extension settings
        // and to optimize rendering by skipping off-screen halves.
        let isRiskVisible = true;
        let isRewardVisible = true;
        // Only run culling if finished and not editing (smoothing)
        /**
         * GRANULAR CULLING CHECK
         *
         * Unlike simple tools, this tool spans two distinct directions.
         * We check the visibility of the Risk Rectangle and Reward Rectangle *independently*.
         *
         * - If the PT is off-screen (e.g., way up high), we still draw the Risk box.
         * - If the Stop is off-screen, we still draw the Reward box.
         * - We only abort completely if *both* are invisible.
         */
        if (tool.isFinished() && !tool.isEditing()) {
            /**
             * POINT RETRIEVAL
             *
             * We fetch:
             * 1. Logical Points (P0, P1, P2) for calculating text stats (Prices, R:R).
             * 2. Screen Points for drawing the rectangles.
             *
             * Note: P2 (PT) might be null during the very first click of creation, so we guard against that.
             */
            const P0_log = tool.getPoint(0);
            const P1_log = tool.getPoint(1);
            const P2_log = tool.getPoint(2);
            isRiskVisible = this._isRectangleVisible(P0_log, P1_log, options.entryStopLossRectangle);
            isRewardVisible = this._isRectangleVisible(P0_log, P2_log, options.entryPtRectangle);
            // Total Cull: If neither part is visible, stop here.
            if (!isRiskVisible && !isRewardVisible) {
                //console.log('position tool culled')
                return;
            }
        }
        // --- CULLING END ---
        const compositeRenderer = this._renderer;
        // --- GET LOGICAL POINTS (For Text Values) ---
        const P0_logical = tool.getPoint(0); // Entry
        const P1_logical = tool.getPoint(1); // Stop
        const P2_logical = tool.getPoint(2); // PT (Logical) - might be null if not enough points
        // --- GET SCREEN POINTS (For Drawing) ---
        const P_Entry_Screen = this._points[0];
        const P_Stop_Screen = this._points[1];
        // FIX: Safe retrieval of PT Screen point. Defined as AnchorPoint | null.
        const P_PT_Screen = this._points.length >= 3 ? this._points[2] : null;
        const isLong = tool.isCurrentLong();
        // --- 2. Risk Rectangle (Entry <-> Stop Loss) ---
        /**
         * RISK RECTANGLE RENDERER SETUP
         *
         * We configure the Red box.
         * - `points`: From Entry (Screen) to Stop (Screen).
         * - `options`: Derived from `entryStopLossRectangle`.
         */
        const riskPoints = [P_Entry_Screen, P_Stop_Screen];
        this._riskRenderer.setData({
            ...deepCopy(options.entryStopLossRectangle),
            points: riskPoints,
            hitTestBackground: false,
        });
        compositeRenderer.append(this._riskRenderer);
        // --- 3. Reward Rectangle (Entry <-> PT) ---
        // FIX: Type Guard ensures P_PT_Screen is AnchorPoint inside the block
        if (P_PT_Screen) {
            const rewardPoints = [P_Entry_Screen, P_PT_Screen];
            /**
             * REWARD RECTANGLE RENDERER SETUP
             *
             * We configure the Green box.
             * - `points`: From Entry (Screen) to Profit Target (Screen).
             * - `options`: Derived from `entryPtRectangle`.
             * This block only runs if P2 (Target) exists.
             */
            this._rewardRenderer.setData({
                ...deepCopy(options.entryPtRectangle),
                points: rewardPoints,
                hitTestBackground: false,
            });
            compositeRenderer.append(this._rewardRenderer);
        }
        // Canvas labels SL/TP
        if (P0_logical && P1_logical && P_Entry_Screen && P_Stop_Screen &&
            (P_Entry_Screen.x !== P_Stop_Screen.x || P_Entry_Screen.y !== P_Stop_Screen.y)) {
            const pipMult2 = (options.pair || '').includes('JPY') ? 100 : 10000;
            const lots2 = options.lots || 0;
            const riskD = Math.abs(P0_logical.price - P1_logical.price);
            const riskPips2 = (riskD * pipMult2).toFixed(1);
            const riskAmt2 = (riskD * pipMult2 * lots2 * 10).toFixed(2);
            if (!this._slCanvas) this._slCanvas = new SimpleCanvasTextRenderer();
            let slTxt = riskPips2 + ' pips' + (lots2 > 0 ? '\n$' + riskAmt2 : '');
            this._slCanvas.setData({
                topLeft: { x: Math.min(P_Entry_Screen.x, P_Stop_Screen.x), y: Math.min(P_Entry_Screen.y, P_Stop_Screen.y) },
                bottomRight: { x: Math.max(P_Entry_Screen.x, P_Stop_Screen.x), y: Math.max(P_Entry_Screen.y, P_Stop_Screen.y) },
                text: slTxt, color: 'rgba(255,255,255,0.9)',
            });
            compositeRenderer.append(this._slCanvas);
            if (P_PT_Screen && P2_logical) {
                const tpD = Math.abs(P0_logical.price - P2_logical.price);
                const tpPips2 = (tpD * pipMult2).toFixed(1);
                const tpAmt2 = (tpD * pipMult2 * lots2 * 10).toFixed(2);
                const rr2 = riskD > 0 ? (tpD / riskD).toFixed(2) : '—';
                if (!this._tpCanvas) this._tpCanvas = new SimpleCanvasTextRenderer();
                let tpTxt = tpPips2 + ' pips\nRR ' + rr2 + (lots2 > 0 ? '\n$' + tpAmt2 : '');
                this._tpCanvas.setData({
                    topLeft: { x: Math.min(P_Entry_Screen.x, P_PT_Screen.x), y: Math.min(P_Entry_Screen.y, P_PT_Screen.y) },
                    bottomRight: { x: Math.max(P_Entry_Screen.x, P_PT_Screen.x), y: Math.max(P_Entry_Screen.y, P_PT_Screen.y) },
                    text: tpTxt, color: 'rgba(255,255,255,0.9)',
                });
                compositeRenderer.append(this._tpCanvas);
            }
        }
        // --- 4. Dynamic Auto-Text Labels ---
        if (options.showAutoText && P_Entry_Screen && P_Stop_Screen && (P_Entry_Screen.x !== P_Stop_Screen.x || P_Entry_Screen.y !== P_Stop_Screen.y)) {
            // 1. Define Theme Defaults (Fallback styles if user provided nothing)
            const isLongPos = P2_logical ? P2_logical.price > P0_logical.price : true
            const tpBgColor = isLongPos ? 'rgba(41,98,255,0.9)' : 'rgba(239,83,80,0.9)'
            const slBgColor = isLongPos ? 'rgba(239,83,80,0.75)' : 'rgba(41,98,255,0.75)'
            const entryBgColor = 'rgba(41,98,255,0.9)'
            const defaultAutoTextStyle = {
                font: { color: 'white', size: 11, bold: true, family: 'Montserrat, sans-serif' },
                box: {
                    background: { color: 'rgba(0,0,0,0)', inflation: { x: 6, y: 3 } },
                    border: { color: 'transparent', width: 0, radius: 4, highlight: false, style: 0 },
                    alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center }
                },
                padding: 4,
            };
            const tpTextStyle = {
                font: { color: 'white', size: 11, bold: true, family: 'Montserrat, sans-serif' },
                box: {
                    background: { color: tpBgColor, inflation: { x: 6, y: 3 } },
                    border: { color: 'transparent', width: 0, radius: 4, highlight: false, style: 0 },
                    alignment: { vertical: BoxVerticalAlignment.Top, horizontal: BoxHorizontalAlignment.Center }
                },
                padding: 4,
            };
            const slTextStyle = {
                font: { color: 'white', size: 11, bold: true, family: 'Montserrat, sans-serif' },
                box: {
                    background: { color: slBgColor, inflation: { x: 6, y: 3 } },
                    border: { color: 'transparent', width: 0, radius: 4, highlight: false, style: 0 },
                    alignment: { vertical: BoxVerticalAlignment.Bottom, horizontal: BoxHorizontalAlignment.Center }
                },
                padding: 4,
            };
            const entryTextStyle = {
                font: { color: 'white', size: 11, bold: true, family: 'Montserrat, sans-serif' },
                box: {
                    background: { color: entryBgColor, inflation: { x: 6, y: 3 } },
                    border: { color: 'transparent', width: 0, radius: 4, highlight: false, style: 0 },
                    alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center }
                },
                padding: 4,
            };
            const priceFormatter = this._series.priceFormatter();
            const riskDistance = Math.abs(P0_logical.price - P1_logical.price);
            // ============================================================
            // 4.1. Risk Label (Stop Loss Zone)
            // Source: options.entryStopLossText
            // ============================================================
            // A. Merge Defaults + User Options
            const finalRiskTextOptions = merge(deepCopy(slTextStyle), options.entryStopLossText);
            // B. Set Dynamic Text (Preserving User Note)
            // TV-style text with pips and amount
            const pipMult = (options.pair||'').includes('JPY') ? 100 : 10000
            const lots = options.lots || 0
            const riskPips = (riskDistance * pipMult).toFixed(1)
            const riskPct = P0_logical.price > 0 ? ((riskDistance / P0_logical.price) * 100).toFixed(3) : '0'
            const riskAmt = (riskDistance * pipMult * lots * 10).toFixed(2)
            const rrCalc = P2_logical ? (Math.abs(P0_logical.price - P2_logical.price) / riskDistance).toFixed(2) : '—'
            const entryStats = `PyG Apertura: ${priceFormatter.format(riskDistance)}, Cantidad: ${Math.round(lots * 10000)}\nratio riesgo/beneficio: ${rrCalc}`
            const riskStats = `Stop: ${priceFormatter.format(riskDistance)} (${riskPct}%) ${riskPips}, Importe: ${riskAmt}`;
            // Capture user text (if any) from the merged options before we overwrite it
            const riskUserNote = finalRiskTextOptions.value;
            // Append user note on a new line if it exists
            finalRiskTextOptions.value = riskStats;
            // Entry label - separate renderer at entry price
            const entryTextOptions = JSON.parse(JSON.stringify(entryTextStyle));
            entryTextOptions.value = entryStats;
            // C. Apply Smart Alignment Logic
            // If the final alignment is 'Middle' (the generic default), we assume the user wants Auto-Alignment.
            // If the user explicitly set 'Top' or 'Bottom', we respect it.
            if (finalRiskTextOptions.box.alignment.vertical === BoxVerticalAlignment.Middle) {
                finalRiskTextOptions.box.alignment.vertical = isLong ? BoxVerticalAlignment.Bottom : BoxVerticalAlignment.Top;
            }
            /**
             * RISK LABEL GENERATION
             *
             * 1. **Formatting:** We format Entry, Stop, and Risk amount using the series formatter.
             * 2. **Merging:** We merge these stats with any custom text provided by the user.
             * 3. **Auto-Alignment:** We dynamically set the vertical alignment ('Top' or 'Bottom')
             *    based on the trade direction (Long/Short) to keep text inside the box.
             */
            this._riskLabelRenderer.setData({
                text: finalRiskTextOptions,
                points: riskPoints,
                hitTestBackground: true,
                toolDefaultHoverCursor: options.defaultHoverCursor,
                toolDefaultDragCursor: options.defaultDragCursor,
            });
            compositeRenderer.append(this._riskLabelRenderer);
            // Entry label at entry price (P_Entry_Screen)
            this._entryLabelRenderer.setData({
                text: entryTextOptions,
                points: [P_Entry_Screen, P_Stop_Screen],
                hitTestBackground: false,
                toolDefaultHoverCursor: options.defaultHoverCursor,
                toolDefaultDragCursor: options.defaultDragCursor,
            });
            compositeRenderer.append(this._entryLabelRenderer);
            // ============================================================
            // 4.2. Reward Label (PT Zone)
            // Source: options.entryPtText  <-- FIX: Now using correct options source
            // ============================================================
            if (P_PT_Screen && P2_logical) {
                const rewardDistance = Math.abs(P0_logical.price - P2_logical.price);
                const rrValue = riskDistance !== 0 ? (rewardDistance / riskDistance).toFixed(2) : '0.00';
                // A. Merge Defaults + User Options
                const finalRewardTextOptions = merge(deepCopy(tpTextStyle), options.entryPtText);
                // B. Set Dynamic Text (Preserving User Note)
                // TV-style reward text
                const rewardPips = (rewardDistance * pipMult).toFixed(1)
                const rewardPct = P0_logical.price > 0 ? ((rewardDistance / P0_logical.price) * 100).toFixed(3) : '0'
                const rewardAmt = (rewardDistance * pipMult * lots * 10).toFixed(2)
                const rewardStats = `Objetivo: ${priceFormatter.format(rewardDistance)} (${rewardPct}%) ${rewardPips}, Importe: ${rewardAmt}`;
                // Capture user text (if any) from the merged options
                const rewardUserNote = finalRewardTextOptions.value;
                // Append user note on a new line if it exists
                finalRewardTextOptions.value = (rewardUserNote && rewardUserNote.trim().length > 0)
                    ? `${rewardStats}\n${rewardUserNote}`
                    : rewardStats;
                // C. Apply Smart Alignment Logic
                // If 'Middle', apply Auto-Alignment (Opposite of Risk label)
                if (finalRewardTextOptions.box.alignment.vertical === BoxVerticalAlignment.Middle) {
                    finalRewardTextOptions.box.alignment.vertical = isLong ? BoxVerticalAlignment.Top : BoxVerticalAlignment.Bottom;
                }
                // Pass the Reward points (Entry + PT)
                const rewardPoints = [P_Entry_Screen, P_PT_Screen];
                /**
                 * REWARD LABEL GENERATION
                 *
                 * Similar to the Risk label, but calculates the R:R ratio.
                 * 1. **Calculation:** `RewardDist / RiskDist`.
                 * 2. **Alignment:** Uses the opposite vertical alignment of the Risk label to ensure
                 *    symmetry (e.g., if Risk text is at the bottom of its box, Reward text is at the top of its box).
                 */
                this._rewardLabelRenderer.setData({
                    text: finalRewardTextOptions,
                    points: rewardPoints,
                    hitTestBackground: true,
                    toolDefaultHoverCursor: options.defaultHoverCursor,
                    toolDefaultDragCursor: options.defaultDragCursor,
                });
                compositeRenderer.append(this._rewardLabelRenderer);
            }
        }
        // --- 5. Anchors ---
        // Anchors should only appear when the tool is actually fully finished (clicked twice).
        //if (this.areAnchorsVisible() && tool.isFinished()) {
        this._addAnchors(compositeRenderer);
        //}
    }
    /**
     * Adds the three interactive anchor points (Entry, Stop, Target).
     *
     * We assign `VerticalResize` cursors to all three because the primary interaction mode
     * for adjusting this tool is dragging the price levels up and down.
     *
     * @param renderer - The composite renderer to append anchors to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        if (this._points.length < 3)
            return;
        // Entry, Stop, PT
        const entryAnchor = this._points[0];
        const stopAnchor = this._points[1];
        const ptAnchor = this._points[2];
        entryAnchor.specificCursor = PaneCursorType.VerticalResize;
        stopAnchor.specificCursor = PaneCursorType.VerticalResize;
        ptAnchor.specificCursor = PaneCursorType.VerticalResize;
        renderer.append(this.createLineAnchor({
            points: [entryAnchor, stopAnchor, ptAnchor],
            defaultAnchorHoverCursor: PaneCursorType.VerticalResize,
            defaultAnchorDragCursor: PaneCursorType.VerticalResize,
        }, 0));
    }
    /**
     * Helper to determine visibility of a specific rectangle component (Risk or Reward).
     *
     * It constructs a bounding box from the two defining logical points and uses
     * `getToolCullingState` with specific sub-segment checks to handle infinite extensions
     * properly if they are enabled in the options.
     *
     * @param pA - Start point of the rectangle part.
     * @param pB - End point of the rectangle part.
     * @param rectOptions - The options containing extension settings.
     * @returns `true` if this part of the tool is visible.
     * @private
     */
    _isRectangleVisible(pA, pB, rectOptions) {
        // 1. Calculate Geometry
        const minTime = Math.min(pA.timestamp, pB.timestamp);
        const maxTime = Math.max(pA.timestamp, pB.timestamp);
        const minPrice = Math.min(pA.price, pB.price);
        const maxPrice = Math.max(pA.price, pB.price);
        const P_TL = { timestamp: minTime, price: maxPrice };
        const P_TR = { timestamp: maxTime, price: maxPrice };
        const P_BL = { timestamp: minTime, price: minPrice };
        const P_BR = { timestamp: maxTime, price: minPrice };
        const cullingPoints = [P_TL, P_TR, P_BL, P_BR];
        // 2. Define Sub-Segments for Infinite Extension Check
        // 0-1 is Top Edge, 2-3 is Bottom Edge
        const cullingInfo = {
            subSegments: [[0, 1], [2, 3]]
        };
        const extendOptions = rectOptions.extend;
        // 3. Get State
        // The helper uses the subSegments + extendOptions to perform the full geometric intersection test.
        const cullingState = getToolCullingState(cullingPoints, this._tool, extendOptions, undefined, cullingInfo);
        // 4. Interpret State
        // Since we provided subSegments, the helper returns 'Visible' if *any* part intersects,
        // or 'FullyOffScreen' if nothing intersects. We don't need manual directional checks.
        return cullingState === OffScreenState.Visible;
    }
}

// /lightweight-charts-line-tools-long-short-position/src/model/LineToolLongShortPosition.ts
/**
 * Defines the default configuration options for the Long/Short Position tool.
 *
 * **Tutorial Note:**
 * This tool is visually composed of two distinct zones:
 * 1. **Risk Zone (Stop Loss):** Red rectangle (`entryStopLossRectangle`) + Text.
 * 2. **Reward Zone (Profit Target):** Green rectangle (`entryPtRectangle`) + Text.
 *
 * The defaults configure these with standard trading colors (Red/Green) and enable
 * the "Auto Text" feature (`showAutoText: true`) which automatically calculates and displays
 * the Risk/Reward ratio and price levels.
 */
const LongShortPositionOptionDefaults = {
    visible: true,
    editable: true,
    defaultHoverCursor: PaneCursorType.Pointer,
    defaultDragCursor: PaneCursorType.Grabbing,
    defaultAnchorHoverCursor: PaneCursorType.Pointer,
    defaultAnchorDragCursor: PaneCursorType.Grabbing,
    notEditableCursor: PaneCursorType.NotAllowed,
    showPriceAxisLabels: true,
    showTimeAxisLabels: true,
    priceAxisLabelAlwaysVisible: false,
    timeAxisLabelAlwaysVisible: false,
    showAutoText: true,
    entryStopLossRectangle: {
        background: { color: 'rgba(255, 0, 0, 0.2)' },
        border: { width: 1, style: LineStyle.Solid, color: 'red', radius: 0 },
        extend: { left: false, right: false },
    },
    entryPtRectangle: {
        background: { color: 'rgba(0, 128, 0, 0.2)' },
        border: { width: 1, style: LineStyle.Solid, color: 'green', radius: 0 },
        extend: { left: false, right: false },
    },
    entryStopLossText: {
        value: '',
        padding: 0,
        wordWrapWidth: 0,
        forceTextAlign: false,
        forceCalculateMaxLineWidth: false,
        alignment: TextAlignment.Left,
        font: {
            color: 'rgba(255, 255, 255, 1)',
            size: 12,
            bold: false,
            italic: false,
            family: 'sans-serif'
        },
        box: {
            alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center },
            angle: 0,
            scale: 1,
            offset: { x: 0, y: 0 },
            padding: { x: 0, y: 0 },
            maxHeight: 0,
            shadow: { blur: 0, color: 'rgba(0, 0, 0, 0)', offset: { x: 0, y: 0 } },
            border: { color: 'rgba(0, 0, 0, 0)', width: 0, radius: 0, highlight: false, style: LineStyle.Solid },
            background: { color: 'rgba(0, 0, 0, 0)', inflation: { x: 0, y: 0 } },
        },
    },
    entryPtText: {
        value: '',
        padding: 0,
        wordWrapWidth: 0,
        forceTextAlign: false,
        forceCalculateMaxLineWidth: false,
        alignment: TextAlignment.Left,
        font: {
            color: 'rgba(255, 255, 255, 1)',
            size: 12,
            bold: false,
            italic: false,
            family: 'sans-serif'
        },
        box: {
            alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center },
            angle: 0,
            scale: 1,
            offset: { x: 0, y: 0 },
            padding: { x: 0, y: 0 },
            maxHeight: 0,
            shadow: { blur: 0, color: 'rgba(0, 0, 0, 0)', offset: { x: 0, y: 0 } },
            border: { color: 'rgba(0, 0, 0, 0)', width: 0, radius: 0, highlight: false, style: LineStyle.Solid },
            background: { color: 'rgba(0, 0, 0, 0)', inflation: { x: 0, y: 0 } },
        },
    },
};
/**
 * Concrete implementation of the Long/Short Position drawing tool.
 *
 * **What is a Position Tool?**
 * It is a risk management tool defined by **3 logical points**:
 * 1. **Entry Price (P0):** The start of the trade.
 * 2. **Stop Loss (P1):** The invalidation point.
 * 3. **Profit Target (P2):** The target exit point.
 *
 * **Complex Logic:**
 * Unlike simple shapes, this tool has "Business Logic":
 * - It detects direction (Long if Stop < Entry, Short if Stop > Entry).
 * - It calculates Risk:Reward ratios.
 * - It handles "Flipping" (changing colors/direction when Entry crosses Stop).
 */
class LineToolLongShortPosition extends BaseLineTool {
    /**
     * Explicitly defines the highest valid index for an interactive anchor point.
     *
     * We support 3 interactive handles:
     * - **0:** Entry Price.
     * - **1:** Stop Loss.
     * - **2:** Profit Target.
     *
     * @override
     * @returns `2`
     */
    maxAnchorIndex() {
        return 2;
    }
    /**
     * Confirms that this tool is created via the "Click-Click" method.
     *
     * **Interaction Flow:**
     * 1. Click Entry.
     * 2. Click Stop Loss.
     * 3. (Auto) Profit Target is initially generated at 3R (3x Risk) automatically.
     *
     * @override
     * @returns `true`
     */
    supportsClickClickCreation() { return true; }
    /**
     * Indicates if the tool supports "Click-Drag" creation.
     *
     * We disable this (`false`) to enforce precision. Placing Entry and Stop Loss
     * usually requires exact clicking rather than a sweeping drag motion.
     *
     * @override
     * @returns `false`
     */
    supportsClickDragCreation() { return false; }
    /**
     * Enables geometric constraints (Shift key) during creation.
     *
     * If `true`, holding Shift while placing points will apply the logic defined in
     * {@link getShiftConstrainedPoint} (typically locking the price level to prevent drift).
     *
     * @override
     * @returns `true`
     */
    supportsShiftClickClickConstraint() { return true; }
    /**
     * Indicates if holding Shift should apply geometric constraints during drag creation.
     *
     * Not applicable as `supportsClickDragCreation` is false.
     *
     * @override
     * @returns `false`
     */
    supportsShiftClickDragConstraint() { return false; }
    /**
     * Initializes the Long/Short Position tool.
     *
     * **Tutorial Note on Logic:**
     * 1. **Defaults:** Merges defaults with user options.
     * 2. **Legacy Handling:** Checks if `points` contains only 2 points (Entry/Stop). If so,
     *    it auto-calculates and pushes a 3rd point (Profit Target) to ensure the tool is valid.
     * 3. **Direction Inference:** Determines if the tool is "Long" or "Short" based on P0 vs P1.
     * 4. **View:** Assigns `LineToolLongShortPositionPaneView` for complex multi-rect rendering.
     *
     * @param coreApi - The Core Plugin API.
     * @param chart - The Lightweight Charts Chart API.
     * @param series - The Series API this tool is attached to.
     * @param horzScaleBehavior - The horizontal scale behavior.
     * @param options - Configuration overrides.
     * @param points - Initial points.
     * @param priceAxisLabelStackingManager - The manager for label collision.
     */
    constructor(coreApi, chart, series, horzScaleBehavior, options = {}, points = [], priceAxisLabelStackingManager) {
        const finalOptions = deepCopy(LongShortPositionOptionDefaults);
        merge(finalOptions, options);
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, 'LongShortPosition', 3, // FIX: Pass 3 to super
        priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('LongShortPosition').
         *
         * @override
         */
        this.toolType = 'LongShortPosition';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Position tool requires exactly **3 points** (Entry, Stop, Target). User defines 2 points on creation, the 3rd point
         * which is the target is generated on creation and can be modified after creation
         *
         * @override
         */
        this.pointsCount = 3;
        this._clickCount = 0;
        this._isLong = null;
        this._flipModeActive = false;
        // Properly initialize state flags when loading existing/saved tools.
        if (this._points.length >= 2) {
            this._clickCount = 2;
            // legacy/partial data (missing PT)
            // If we have Entry & Stop but no PT, generate the default 3R PT immediately.
            if (this._points.length < 3) {
                const p0 = this._points[0];
                const p1 = this._points[1];
                // We can safely call this because p0 and p1 exist
                const p2 = this.calculateProfitTarget(p0, p1, p1.timestamp);
                this._points.push(p2);
            }
            const entryPrice = this._points[0].price;
            const stopPrice = this._points[1].price;
            if (entryPrice === stopPrice) {
                // Edge Case: Zero Risk (collapsed tool).
                // Attempt to infer direction from Profit Target (P2) if it exists.
                if (this._points.length >= 3) {
                    const ptPrice = this._points[2].price;
                    // If PT is below Entry, it implies a Short position. Otherwise, default to Long.
                    this._isLong = ptPrice < entryPrice ? false : true;
                }
                else {
                    // Fallback: Default to Long if no PT context is available
                    this._isLong = true;
                }
            }
            else {
                // Standard Case: Direction derived strictly from Entry vs Stop
                this._isLong = entryPrice > stopPrice;
            }
        }
        this._setPaneViews([new LineToolLongShortPositionPaneView(this, this._chart, this._series)]);
    }
    /**
     * Determines the current direction of the trade based on the geometry.
     *
     * @returns `true` if Entry Price > Stop Price (Long), `false` otherwise (Short).
     */
    isCurrentLong() {
        // Use this.points() to ensure we check against ghost points during creation
        const allPoints = this.points();
        if (allPoints.length < 2)
            return false;
        return allPoints[0].price > allPoints[1].price;
    }
    /**
     * Helper to retrieve the base text styling options for the auto-generated labels.
     *
     * Used internally or by views to ensure consistency when rendering the dynamic text stats.
     *
     * @returns A deep copy of the `entryStopLossText` options.
     */
    getAutoTextBaseOptions() {
        const currentOptions = this.options();
        return deepCopy(currentOptions.entryStopLossText);
    }
    /**
     * Retrieves the internally cached direction state.
     *
     * This state helps track if a "Flip" has occurred during a drag operation.
     *
     * @returns `true` (Long), `false` (Short), or `null` (Uninitialized).
     */
    getStoredDirection() {
        return this._isLong;
    }
    /**
     * Updates the internally cached direction state.
     *
     * @param isLong - The new direction (`true` for Long).
     */
    setStoredDirection(isLong) {
        this._isLong = isLong;
    }
    /**
     * Safely rounds a raw price value to the nearest tick mark (`minMove`).
     *
     * **Why is this needed?**
     * Floating point math and mouse positions can result in prices like `100.0000001`.
     * This helper ensures values align with the instrument's precision (e.g., 0.01) while
     * guarding against division-by-zero errors if `minMove` is invalid.
     *
     * @param price - The raw price.
     * @returns The rounded price.
     * @private
     */
    _roundPrice(price) {
        const series = this.getSeries();
        const minMove = series.options().priceFormat.minMove;
        // Guard against invalid minMove (0 or extremely close to 0)
        if (minMove <= 1e-14) {
            return price;
        }
        return Math.round(price / minMove) * minMove;
    }
    /**
     * Calculates the Profit Target (P2) price based on the Entry (P0) and Stop Loss (P1).
     *
     * **Logic (3R Rule):**
     * 1. Calculates the Risk distance: `|Entry - Stop|`.
     * 2. Multiplies Risk by 3 to get the Reward distance.
     * 3. Adds/Subtracts Reward from Entry based on direction (Long/Short).
     * 4. Enforces a minimum distance (1 tick) to prevent the PT from overlapping the Entry.
     *
     * @param entryPoint - The entry point P0.
     * @param stopPoint - The stop loss point P1.
     * @param ptPointTimestamp - The X-coordinate for the new PT (usually synced to P1).
     * @returns A new {@link LineToolPoint} for the Profit Target.
     */
    calculateProfitTarget(entryPoint, stopPoint, ptPointTimestamp) {
        const series = this.getSeries();
        // Use minMove for mathematical rounding
        const minMove = series.options().priceFormat.minMove;
        // PERFORMANCE: Use math rounding instead of string parsing
        //const entryPrice = Math.round(entryPoint.price / minMove) * minMove;
        //const stopLossPrice = Math.round(stopPoint.price / minMove) * minMove;
        const entryPrice = this._roundPrice(entryPoint.price);
        const stopLossPrice = this._roundPrice(stopPoint.price);
        const riskDistance = Math.abs(entryPrice - stopLossPrice);
        const rewardDistance = riskDistance * 3; // 3x Reward
        const isLong = entryPrice > stopLossPrice;
        let targetPtPrice;
        if (isLong) {
            targetPtPrice = entryPrice + rewardDistance;
        }
        else {
            targetPtPrice = entryPrice - rewardDistance;
        }
        // Proximity Constraint
        if (isLong) {
            targetPtPrice = Math.max(targetPtPrice, entryPrice + minMove);
        }
        else {
            targetPtPrice = Math.min(targetPtPrice, entryPrice - minMove);
        }
        // PERFORMANCE: Final math rounding
        //const finalPtPrice = Math.round(targetPtPrice / minMove) * minMove;
        const finalPtPrice = this._roundPrice(targetPtPrice);
        return {
            price: finalPtPrice,
            timestamp: ptPointTimestamp,
        };
    }
    /**
     * Detects if the trade direction has flipped (Entry crossed Stop Loss).
     *
     * @param newEntryPrice - The new entry price.
     * @param newStopPrice - The new stop price.
     * @returns `true` if the direction changed (Long -> Short or vice versa), `false` otherwise.
     * @private
     */
    _checkForFlip(newEntryPrice, newStopPrice) {
        const newIsLong = newEntryPrice > newStopPrice;
        const flipOccurred = this._isLong !== null && this._isLong !== newIsLong;
        this._isLong = newIsLong;
        return flipOccurred;
    }
    /**
     * The central state machine logic for the tool.
     *
     * **Tutorial Note:**
     * This method handles the complex behavior when dragging points:
     * 1. **Flip Detection:** If Entry crosses Stop, it flags `_flipModeActive`.
     * 2. **Forced 3R:** If flipping or creating, it forces the PT to stay at exactly 3x Risk.
     * 3. **Custom Mode:** If the user drags the PT explicitly, it respects that distance but ensures
     *    it doesn't cross back over the Entry price (min 1 tick distance).
     *
     * This runs after every drag event to keep the 3 points geometrically valid.
     *
     * @private
     */
    _updateAndNormalizeToolState() {
        const series = this.getSeries();
        const minMove = series.options().priceFormat.minMove;
        const entryPoint = this._points[0];
        const stopPoint = this._points[1];
        if (this._points.length < 3)
            return;
        // Check if RISK is collapsed (Entry vs Stop)
        const currentRiskDist = Math.abs(entryPoint.price - stopPoint.price);
        const isRiskCollapsed = currentRiskDist <= minMove * 1.5;
        // 1. Check for Flip (Scenarios 2 & 3)
        const flipOccurred = this._checkForFlip(entryPoint.price, stopPoint.price);
        const isLong = ensureNotNull(this._isLong);
        // 2. Manage "Flip Mode" State
        if (flipOccurred) {
            this._flipModeActive = true;
        }
        // 3. Logic Branch
        // Force 3R if: Creating OR Flip Active OR Risk is Collapsed (Crossover zone)
        if (this._clickCount < 2 || this._flipModeActive || isRiskCollapsed) {
            // --- SCENARIO 2 & 3: FORCED 3R MODE ---
            // Continuously recalculate 3R based on the *current* Entry/Stop positions
            const requiredPtPoint = this.calculateProfitTarget(entryPoint, stopPoint, stopPoint.timestamp);
            this._points[2].price = requiredPtPoint.price;
            this._points[2].timestamp = stopPoint.timestamp;
        }
        else {
            // --- SCENARIO 1 & 5: CUSTOM MODE ---
            // Maintain Custom R:R, but enforce proximity (Scenario 1)
            const currentPtPrice = this._points[2].price;
            let constrainedPtPrice = currentPtPrice;
            if (isLong) {
                // Long: PT must be above Entry + MinMove
                constrainedPtPrice = Math.max(currentPtPrice, entryPoint.price + minMove);
            }
            else {
                // Short: PT must be below Entry - MinMove
                constrainedPtPrice = Math.min(currentPtPrice, entryPoint.price - minMove);
            }
            this._points[2].price = constrainedPtPrice;
            // FIX: Always sync PT timestamp to Stop timestamp in Custom Mode too
            this._points[2].timestamp = stopPoint.timestamp;
        }
    }
    /**
     * Overrides the base method to inject a virtual Profit Target during creation.
     *
     * **Why override?**
     * During creation, the user only clicks P0 (Entry) and P1 (Stop). The P2 (Target) hasn't
     * been created yet. This override dynamically calculates where P2 *would* be (at 3R)
     * and returns it as part of the array. This allows the View to render the full Green/Red
     * shape while the user is still just dragging the Stop Loss ghost point.
     *
     * @returns The array of points, potentially including a virtual P2.
     * @override
     */
    points() {
        const corePoints = super.points(); // [Entry] or [Entry, GhostStop]
        if (corePoints.length === 2) {
            // Calculate virtual PT
            const virtualPT = this.calculateProfitTarget(corePoints[0], corePoints[1], corePoints[1].timestamp);
            return [...corePoints, virtualPT];
        }
        return corePoints;
    }
    /**
     * Retrieves a point from the (potentially augmented) points array.
     *
     * Delegates to the overridden {@link points} method to ensure virtual points are returned correctly.
     *
     * @param index - The point index.
     * @returns The point or `null`.
     * @override
     */
    getPoint(index) {
        // Use the overridden points() logic
        const allPoints = this.points();
        return allPoints[index] || null;
    }
    /**
     * Handles complex drag logic for Entry, Stop, and Target points.
     *
     * **Logic:**
     * - **Index 2 (Target):** Constrains the drag so the Target cannot cross the Entry price.
     *   It allows "Custom R:R" mode (user sets specific target).
     * - **Index 0/1 (Entry/Stop):** Updates the point and then triggers `_updateAndNormalizeToolState`.
     *   This might cause the Target to jump (if in 3R mode) to maintain the ratio.
     *
     * @param index - The anchor index.
     * @param point - The new logical position.
     * @override
     */
    setPoint(index, point) {
        const series = this.getSeries();
        const minMove = series.options().priceFormat.minMove;
        // PERFORMANCE: Use math rounding for the incoming point
        //const newPrice = Math.round(point.price / minMove) * minMove;
        const newPrice = this._roundPrice(point.price);
        if (index === 2) {
            // --- SCENARIO 4: PT DRAG ---
            const entryPrice = this._points[0].price;
            const isLong = this.isCurrentLong();
            let constrainedPrice = newPrice;
            if (isLong) {
                // Long: PT cannot go below (Entry + 1 tick)
                constrainedPrice = Math.max(newPrice, entryPrice + minMove);
            }
            else {
                // Short: PT cannot go above (Entry - 1 tick)
                constrainedPrice = Math.min(newPrice, entryPrice - minMove);
            }
            // Apply
            this._points[2].price = constrainedPrice;
            this._points[2].timestamp = this._points[1].timestamp;
        }
        else if (index < 2) {
            // 3. Handle Entry (0) or Stop Loss (1) Drag
            super.setPoint(index, { price: newPrice, timestamp: point.timestamp });
            this._updateAndNormalizeToolState();
        }
    }
    /**
     * Orchestrates the creation flow (Click 1 -> Entry, Click 2 -> Stop + Auto PT).
     *
     * **Tutorial Note:**
     * 1. **Click 1:** Adds Entry.
     * 2. **Click 2:** Adds Stop. Crucially, it **also** creates and pushes the permanent Profit Target (P2)
     *    calculated at 3R. It then immediately finalizes the tool (`tryFinish()`).
     *
     * @param point - The raw mouse point.
     * @override
     */
    addPoint(point) {
        // PERFORMANCE: Use math rounding for the new point
        const series = this.getSeries();
        series.options().priceFormat.minMove;
        //point.price = Math.round(point.price / minMove) * minMove;
        point.price = this._roundPrice(point.price);
        if (this.isFinished())
            return;
        if (this._clickCount === 0) {
            // Click 1: Entry Point (P0)
            super.addPoint(point);
            this._clickCount = 1;
        }
        else if (this._clickCount === 1) {
            // Click 2: Finalize Stop Loss (P1)
            super.addPoint(point);
            this._clickCount = 2;
            // Create and Add Permanent PT (P2)
            const p0 = this._points[0];
            const p1 = this._points[1];
            const p2 = this.calculateProfitTarget(p0, p1, p1.timestamp);
            this._points.push(p2);
            this._updateAndNormalizeToolState();
            this.tryFinish();
            this._coreApi.fireAfterEditEvent(this, 'lineToolFinished');
        }
    }
    /**
     * Legacy/No-op method.
     *
     * The core plugin handles ghosting via `setLastPoint`. This override exists to satisfy
     * internal contracts or legacy patterns but performs no action.
     */
    updatePreviewPoints(point) {
        // No-op: Core handles ghosting.
    }
    /**
     * Performs the hit test for the Position tool.
     *
     * **Architecture Note:**
     * Delegates to `LineToolLongShortPositionPaneView`. The view composites multiple renderers
     * (Risk Rect, Reward Rect, Labels). Hitting any of them selects the tool.
     *
     * @param x - X coordinate.
     * @param y - Y coordinate.
     * @returns A hit result, or `null`.
     * @override
     */
    _internalHitTest(x, y) {
        // This guards against hitTest being called after the tool has been destroyed and _paneViews cleared.
        if (!this._paneViews || this._paneViews.length === 0 || !this._paneViews[0]) {
            return null;
        }
        const paneView = this._paneViews[0];
        const compositeRenderer = paneView.renderer();
        if (!compositeRenderer || !compositeRenderer.hitTest) {
            return null;
        }
        return compositeRenderer.hitTest(x, y);
    }
    /**
     * Resets transient state flags at the end of an interaction (MouseUp).
     *
     * Specifically, it clears `_flipModeActive`, marking the end of a dynamic flip operation.
     * The geometric order of points is **not** sorted here because P0/P1/P2 have fixed roles
     * (Entry/Stop/Target) regardless of their price values.
     *
     * @override
     */
    normalize() {
        this._flipModeActive = false;
    }
    /**
     * Implements Shift key constraints for editing.
     *
     * **Constraint Logic:**
     * - **Entry/Stop (0, 1):** Locks the **Price** (Horizontal move only). This allows the user
     *   to slide the trade setup forward/backward in time without accidentally changing the price levels.
     * - **Target (2):** No extra constraint applied (handled by `setPoint` limits).
     *
     * @param pointIndex - Anchor index.
     * @param rawScreenPoint - Mouse position.
     * @param phase - Interaction phase.
     * @param originalLogicalPoint - Start position.
     * @param allOriginalLogicalPoints - Full state snapshot.
     * @returns The constrained point result.
     * @override
     */
    getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, allOriginalLogicalPoints) {
        // Default behavior: No constraint
        const result = {
            point: rawScreenPoint,
            snapAxis: 'none'
        };
        // Only apply constraint during the Editing phase (dragging existing points),
        // not during Creation.
        if (phase !== InteractionPhase.Editing) {
            return result;
        }
        // Apply constraint only to Entry (0) and Stop (1).
        // PT (2) is skipped because it is already strictly constrained to the Y-axis by setPoint logic.
        if (pointIndex === 0 || pointIndex === 1) {
            // Constraint: Lock Price (Horizontal movement only).
            // We calculate the screen Y coordinate of the *original* price to keep it locked.
            const series = this.getSeries();
            const lockedScreenY = series.priceToCoordinate(originalLogicalPoint.price);
            if (lockedScreenY !== null) {
                return {
                    // Use mouse X, but lock Y to the original position
                    point: new Point(rawScreenPoint.x, lockedScreenY),
                    snapAxis: 'price' // Hint to the manager to preserve the exact original logical price
                };
            }
        }
        return result;
    }
}

// /lightweight-charts-line-tools-long-short-position/src/index.ts
// Define the name under which this specific tool will be registered
const LONG_SHORT_POSITION_TOOL_NAME = 'LongShortPosition';
/**
 * Registers the Long/Short Position tool with the provided Core Plugin instance.
 *
 * @param corePlugin - The instance of the Core Line Tools Plugin.
 * @returns void
 *
 * @example
 * ```ts
 * registerLongShortPositionPlugin(corePlugin);
 * ```
 */
function registerLongShortPositionPlugin(corePlugin) {
    // Register the LongShortPosition Tool
    // We pass the specific name and the class constructor.
    corePlugin.registerLineTool(LONG_SHORT_POSITION_TOOL_NAME, LineToolLongShortPosition);
    console.log(`Registered Line Tool: ${LONG_SHORT_POSITION_TOOL_NAME}`);
}

export { LineToolLongShortPosition, registerLongShortPositionPlugin as default, registerLongShortPositionPlugin };
//# sourceMappingURL=lightweight-charts-line-tools-long-short-position.js.map
