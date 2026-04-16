import { LineStyle } from 'lightweight-charts';
import { LineToolPaneView, SegmentRenderer, HitTestResult, HitTestType, TextRenderer, RectangleRenderer, getToolCullingState, OffScreenState, LineCap, LineJoin, deepCopy, AnchorPoint, BoxVerticalAlignment, BoxHorizontalAlignment, TextAlignment, BaseLineTool, merge, InteractionPhase, Point } from 'lightweight-charts-line-tools-core';

// /lightweight-charts-line-tools-fib-retracement/src/views/LineToolFibRetracementPaneView.ts
/**
 * Pane View for the Fibonacci Retracement tool.
 *
 * **Tutorial Note on Complexity:**
 * This is the most complex view in the library. While most tools have one renderer, the
 * Fib Retracement manages an **array of renderer sets**. For every level (e.g., 0.618),
 * it coordinates:
 * 1. A `SegmentRenderer` for the level line.
 * 2. A `RectangleRenderer` for the fill between this level and the previous one.
 * 3. A `TextRenderer` for the coefficient and price label.
 *
 * It implements a "Sub-Segment" culling strategy to ensure the tool remains visible
 * as long as any individual level line is on screen.
 */
class LineToolFibRetracementPaneView extends LineToolPaneView {
    /**
     * Initializes the Fibonacci View and pre-allocates renderer sets for the
     * levels configured in the tool options.
     *
     * @param source - The specific Fibonacci model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        super(source, chart, series);
        /**
         * An array of pooled renderer sets. Each entry contains the line, rectangle,
         * and label renderers for a specific Fibonacci level.
         * @protected
         */
        this._levelRenderers = [];
        /**
         * Renderer for the primary trend line (P0 to P1) that defines the Fib range.
         * @protected
         */
        this._primaryLineRenderer = new SegmentRenderer(new HitTestResult(HitTestType.MovePoint));
        // Initialize renderers for all potential levels (e.g., 11 levels = 11 lines, 10 fills, 11 labels)
        const maxLevels = source.options().levels.length;
        for (let i = 0; i < maxLevels; i++) {
            this._levelRenderers.push({
                line: new SegmentRenderer(new HitTestResult(HitTestType.MovePoint)),
                rectangle: new RectangleRenderer(),
                label: new TextRenderer(),
            });
        }
    }
    /**
     * Calculates the price difference between the current level and a user-specified
     * target coefficient.
     *
     * **Tutorial Note:**
     * This feature allows traders to see exactly how many price units exist between
     * two specific Fib levels (e.g., "Distance from 0.618 to 0.5").
     *
     * @param config - The configuration for the current level.
     * @param levelPrice - The calculated price of the current level.
     * @param levelsConfig - The full list of level configurations.
     * @param levelsData - The pre-calculated coordinates and prices for all levels.
     * @returns A formatted string like "(Diff: 10.50 from 0.5 line)" or an empty string.
     * @private
     */
    _calculateDistanceText(config, levelPrice, levelsConfig, levelsData // THIS IS NOW THE COMPLETE ARRAY
    ) {
        // FIX: Only check if enabled. Do NOT check for === 0, as 0 is a valid target coefficient.
        if (!config.distanceFromCoeffEnabled) {
            return '';
        }
        // Search the full levelsConfig array to find the target's index
        const targetIndex = levelsConfig.findIndex(level => level.coeff === config.distanceFromCoeff);
        if (targetIndex === -1) {
            return '';
        }
        // Use the found index to access the complete, pre-calculated coordinates array
        const targetPrice = levelsData[targetIndex].price;
        const priceDifference = Math.abs(levelPrice - targetPrice);
        if (priceDifference === 0) {
            return '';
        }
        const priceFormatter = this._series.priceFormatter();
        const formattedPriceDifference = priceFormatter.format(priceDifference);
        return ` (Diff: ${formattedPriceDifference} from ${config.distanceFromCoeff} line)`;
    }
    /**
     * Helper to generate a translucent RGBA color string from a hex or rgb input.
     *
     * **Why use this?**
     * To create the "faded" background effect between Fib levels, we must apply
     * the user-defined `opacity` to the level's primary `color`. This method parses
     * various CSS color formats and injects the correct alpha value.
     *
     * @param color - The base color string (Hex or RGB).
     * @param opacity - The alpha value (0 to 1).
     * @returns A valid `rgba(...)` CSS string.
     * @private
     */
    _getFadedColor(color, opacity) {
        let r = 0, g = 0, b = 0;
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                // Handle short hex #RGB
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            }
            else if (hex.length >= 6) {
                // Handle standard hex #RRGGBB
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
        }
        else if (color.startsWith('rgb')) {
            // Extract numbers from "rgb(r, g, b)" or "rgba(r, g, b, a)"
            const matches = color.match(/(\d+(\.\d+)?)/g);
            if (matches && matches.length >= 3) {
                r = parseFloat(matches[0]);
                g = parseFloat(matches[1]);
                b = parseFloat(matches[2]);
            }
            else {
                // Fallback if regex fails (unlikely for valid CSS colors)
                return color;
            }
        }
        else {
            // Fallback for named colors (e.g. "red", "blue")
            // To support names properly, you'd need a canvas context or a lookup table.
            // Returning a safe default grey here.
            return `rgba(120, 123, 134, ${opacity})`;
        }
        // Return new string with the specific FILL opacity
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    /**
     * The core update logic.
     *
     * This method performs a multi-stage render pass:
     * 1. **Data Prep:** Synchronizes the model's calculated levels with the view.
     * 2. **Culling:** Performs a robust geometric check against every level line.
     * 3. **Level Loop:** Iterates through sorted levels to configure lines, fills, and labels.
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const model = this._tool;
        const options = model.options();
        const points = model.points();
        if (!options.visible || points.length < model.pointsCount) {
            return;
        }
        // 1. Get Calculated Segment Data from Model (Single Source of Truth)
        // We sort this here to ensure labels/colors align with prices, and we will use THIS array for everything below.
        const segmentData = model.getLineSegmentPoints().sort((a, b) => b.coeff - a.coeff);
        // 2. Initial Data Setup: Screen Point Conversion
        const hasScreenPoints = this._updatePoints();
        if (!hasScreenPoints) {
            return;
        }
        const [screenP0, screenP1] = this._points;
        // Get sorted config to match the sorted segmentData
        const levelsConfig = options.levels.slice().sort((a, b) => b.coeff - a.coeff);
        // --- CULLING PREPARATION ---
        const paneDrawingWidth = this._tool.getChartDrawingWidth();
        // CRITICAL FIX: Generate culling points directly from our sorted segmentData.
        // This removes the redundant call to model.getAllLogicalPointsForCulling() which would recalculate everything.
        // This flattens the segments into [Start, End, Start, End...]
        const allLogicalPointsForCulling = [];
        for (const segment of segmentData) {
            allLogicalPointsForCulling.push(segment.start);
            allLogicalPointsForCulling.push(segment.end);
        }
        // Map pre-calculated coordinates
        const allDerivedLevelCoordinates = segmentData.map(segment => {
            const price = segment.price;
            const coordinate = this._series.priceToCoordinate(price);
            return { price: price, coordinate: coordinate };
        });
        // Setup Culling Arrays
        // This tells the culler: "Points 0 & 1 form a line", "Points 2 & 3 form a line", etc.
        const subSegments = [];
        const numSegments = segmentData.length;
        for (let i = 0; i < numSegments; i++) {
            subSegments.push([i * 2, i * 2 + 1]);
        }
        // Perform Culling Check
        const cullingInfo = { subSegments: subSegments };
        /**
         * CULLING PREPARATION & MULTI-SEGMENT CHECK
         *
         * Fibonacci tools are large and can span far beyond the viewport. To ensure
         * performance while preventing "popping" (the tool disappearing while a
         * level is still visible):
         *
         * 1. We flatten every level into a single array of logical points.
         * 2. We define `subSegments` where every pair of points forms a level line.
         * 3. `getToolCullingState` performs a robust intersection test on every
         *    individual line, accounting for infinite extensions if enabled.
         */
        const cullingState = getToolCullingState(allLogicalPointsForCulling, this._tool, options.extend, undefined, cullingInfo);
        if (cullingState !== OffScreenState.Visible) {
            //console.log('fib retracement culled')
            return;
        }
        // --- CULLING END ---
        const lineOptions = {
            ...deepCopy(options.line),
            extend: options.extend,
            join: LineJoin.Miter,
            cap: LineCap.Butt,
        };
        const commonCursorOptions = {
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        };
        // --- RENDER LOOP ---
        for (let i = 0; i < levelsConfig.length; i++) {
            const config = levelsConfig[i];
            const levelData = allDerivedLevelCoordinates[i];
            const levelPrice = levelData.price;
            const levelCoord = levelData.coordinate;
            if (levelCoord === null || !isFinite(levelCoord))
                continue;
            // If the user added more levels dynamically, create new renderers now.
            if (!this._levelRenderers[i]) {
                this._levelRenderers[i] = {
                    line: new SegmentRenderer(new HitTestResult(HitTestType.MovePoint)),
                    rectangle: new RectangleRenderer(),
                    label: new TextRenderer(),
                };
            }
            const levelRendererSet = this._levelRenderers[i];
            const priceFormatter = this._series.priceFormatter();
            // --- A. Text Label Setup ---
            const distanceText = this._calculateDistanceText(config, levelPrice, levelsConfig, allDerivedLevelCoordinates);
            const labelText = `${config.coeff} (${priceFormatter.format(levelPrice)})${distanceText}`;
            const minX = Math.min(screenP0.x, screenP1.x);
            const maxX = Math.max(screenP0.x, screenP1.x);
            const paneW = paneDrawingWidth || 800;
            // Support labelPosition: 'right' (default legacy = 'left')
            const labelOnRight = options.labelPosition === 'right';
            const P_TextLeftAnchor  = labelOnRight
                ? new AnchorPoint(maxX, levelCoord, i)
                : new AnchorPoint(0, levelCoord, i);
            const P_TextRightAnchor = labelOnRight
                ? new AnchorPoint(paneW, levelCoord, i)
                : new AnchorPoint(minX, levelCoord, i);
            const finalTextHAlign = labelOnRight
                ? BoxHorizontalAlignment.Left
                : BoxHorizontalAlignment.Right;
            const X_left_of_pane = 0;
            const X_min_segment = minX;
            const finalTextOptions = {
                value: labelText,
                padding: 0,
                wordWrapWidth: 0,
                forceTextAlign: false,
                forceCalculateMaxLineWidth: false,
                alignment: labelOnRight ? TextAlignment.Left : TextAlignment.Right,
                font: {
                    family: 'sans-serif', size: 12, bold: false, italic: false,
                    color: config.color,
                },
                box: {
                    alignment: { horizontal: finalTextHAlign, vertical: BoxVerticalAlignment.Middle },
                    padding: { x: 5, y: 3 },
                }
            };
            /**
             * TEXT LABEL SETUP
             *
             * We construct the label string: `[Coeff] ([Price]) [Optional Distance]`.
             * The label is anchored to the left edge of the visible level segment.
             * We use an `AnchorPoint` with the current loop index `i` to ensure
             * hit-testing links back to the correct logical level.
             */
            levelRendererSet.label.setData({
                points: [P_TextLeftAnchor, P_TextRightAnchor],
                text: finalTextOptions,
                hitTestBackground: true,
            });
            // --- B. Line Segment Setup ---
            const minScreenX = Math.min(screenP0.x, screenP1.x);
            const maxScreenX = Math.max(screenP0.x, screenP1.x);
            const lineStart = new AnchorPoint(options.extend.left ? 0 : minScreenX, levelCoord, i);
            const lineEnd = new AnchorPoint(options.extend.right ? paneDrawingWidth : maxScreenX, levelCoord, i);
            /**
             * LINE SEGMENT CONFIGURATION
             *
             * Each Fib level is drawn as a horizontal line.
             * - If `extend.left` or `extend.right` is enabled, the segment is
             *   projected to the pane boundaries (0 or paneWidth).
             * - Otherwise, the line is bounded by the X-coordinates of the
             *   anchor points P0 and P1.
             */
            levelRendererSet.line.setData({
                points: [lineStart, lineEnd],
                line: { ...lineOptions, color: config.color },
                ...commonCursorOptions,
            });
            // --- C. Background Rectangle (Fill) Setup ---
            let hasRectangle = false;
            if (i > 0) {
                const prevConfig = levelsConfig[i - 1];
                const prevLevelCoord = allDerivedLevelCoordinates[i - 1].coordinate;
                const rectMinY = Math.min(levelCoord, prevLevelCoord);
                const rectMaxY = Math.max(levelCoord, prevLevelCoord);
                if (prevConfig.opacity > 0) {
                    // -----------------------------------------------------------
                    // CHANGE: Use prevConfig.color instead of config.color
                    // -----------------------------------------------------------
                    // This ensures the "Upper" level (prevConfig) owns both the 
                    // opacity AND the color of the fill extending downwards.
                    const fillColor = this._getFadedColor(prevConfig.color, prevConfig.opacity);
                    const rectPoint1 = new AnchorPoint(minScreenX, rectMinY, 0);
                    const rectPoint2 = new AnchorPoint(maxScreenX, rectMaxY, 1);
                    /**
                     * BACKGROUND FILL (CONSECUTIVE LEVELS)
                     *
                     * To create the colored bands between levels:
                     * 1. We look at the "Previous" level in our sorted list.
                     * 2. We define a rectangle spanning the vertical gap between the
                     *    current level and the previous one.
                     * 3. The "Upper" level (higher coefficient) defines the color
                     *    and opacity for the fill extending downwards.
                     */
                    levelRendererSet.rectangle.setData({
                        points: [rectPoint1, rectPoint2],
                        background: { color: fillColor },
                        border: { width: 0, style: LineStyle.Solid, radius: 0 },
                        extend: options.extend,
                        hitTestBackground: false,
                    });
                    hasRectangle = true;
                }
            }
            // --- D. APPEND TO RENDERER (ORDER MATTERS) ---
            // 1. Background Rectangles (Bottom Layer)
            if (hasRectangle) {
                this._renderer.append(levelRendererSet.rectangle);
            }
            // 2. Lines (Middle Layer)
            this._renderer.append(levelRendererSet.line);
            // 3. Labels (Top Layer)
            this._renderer.append(levelRendererSet.label);
        }
        // --- 4. Add Anchors ---
        //if (this.areAnchorsVisible()) {
        this._addAnchors(this._renderer);
        //}
    }
    /**
     * Adds the two primary interactive anchor points (P0 and P1).
     *
     * @param renderer - The composite renderer to append anchors to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        this._points.forEach((point, index) => {
            const anchor = this.createLineAnchor({
                points: [point],
            }, index);
            renderer.append(anchor);
        });
    }
}

// /lightweight-charts-line-tools-fib-retracement/src/model/LineToolFibRetracement.ts
/**
 * Defines the default configuration for the Fibonacci Retracement tool.
 *
 * **Tutorial Note:**
 * This tool is structurally complex because it generates many visual elements from just two points.
 * These defaults include:
 * 1. **Levels:** An array of coefficients (0, 0.236, 0.382, etc.) with their associated colors and opacities.
 * 2. **Extension:** Configuration to extend all level lines infinitely to the left or right.
 * 3. **Trade Strategy:** A placeholder structure for advanced trading setups (Entry/Stop/Target) linked to Fib levels.
 *
 * Reusing these defaults ensures that any new Fib tool starts with the standard industry levels.
 */
const FibRetracementOptionDefaults = {
    visible: true,
    editable: true,
    showPriceAxisLabels: true,
    showTimeAxisLabels: true,
    priceAxisLabelAlwaysVisible: false,
    timeAxisLabelAlwaysVisible: false,
    line: {
        width: 1,
        style: LineStyle.Solid,
    },
    // Global Extension - sets extension for all lines
    extend: { left: false, right: false },
    levels: [
        { color: "#787b86", coeff: 0, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#f23645", coeff: 0.236, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#81c784", coeff: 0.382, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#4caf50", coeff: 0.5, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#089981", coeff: 0.618, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#64b5f6", coeff: 0.786, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#787b86", coeff: 1, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#2962ff", coeff: 1.618, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#f23645", coeff: 2.618, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#9c27b0", coeff: 3.618, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
        { color: "#e91e63", coeff: 4.236, opacity: 0, distanceFromCoeffEnabled: false, distanceFromCoeff: 0 },
    ],
    tradeStrategy: {
        enabled: false,
        longOrShort: "",
        fibBracketOrders: [
            {
                uniqueId: null, conditionLevelCoeff: null, conditionLevelPrice: 0, entryLevelCoeff: null, entryLevelPrice: 0,
                stopMethod: "fib", stopLevelCoeff: null, stopPriceInput: null, stopPointsInput: null, finalStopPrice: 0,
                ptMethod: "fib", ptLevelCoeff: null, ptPriceInput: null, ptPointsInput: null, finalPtPrice: 0,
                isMoveStopToEnabled: false, moveStopToMethod: "fib", moveStopToLevelCoeff: null, moveStopToPriceInput: null,
                moveStopToPointsInput: null, finalMoveStopToPrice: 0, triggerBracketUniqueId: null
            }
        ]
    },
};
/**
 * Concrete implementation of the Fibonacci Retracement drawing tool.
 *
 * **What is a Fibonacci Retracement?**
 * It is a tool used to identify potential support and resistance levels. It is defined by
 * a "Trend Line" connecting two extreme points (usually a high and a low).
 *
 * **Logic Overview:**
 * The tool calculates the vertical distance between P0 and P1 and then draws horizontal
 * lines at specific percentages (coefficients) of that distance.
 *
 * **Inheritance:**
 * It extends `BaseLineTool` directly. While it shares the 2-point requirement of a Trend Line,
 * its rendering and culling logic are entirely unique, necessitating a distinct model and view.
 */
class LineToolFibRetracement extends BaseLineTool {
    /**
     * Explicitly defines the highest valid index for an interactive anchor point.
     *
     * Since the tool is defined by 2 points, the valid handles are at index 0 and 1.
     *
     * @override
     * @returns `1`
     */
    maxAnchorIndex() {
        return 1; // Only 2 anchors: P0 and P1
    }
    /**
     * Confirms that this tool can be created via discrete mouse clicks.
     *
     * @override
     * @returns `true`
     */
    supportsClickClickCreation() { return true; }
    /**
     * Confirms that this tool can be created via a click-and-drag gesture.
     *
     * @override
     * @returns `true`
     */
    supportsClickDragCreation() { return true; }
    /**
     * Enables geometric constraints (Shift key) during click-based creation.
     *
     * @override
     * @returns `true`
     */
    supportsShiftClickClickConstraint() { return true; }
    /**
     * Enables geometric constraints (Shift key) during drag-based creation or editing.
     *
     * @override
     * @returns `true`
     */
    supportsShiftClickDragConstraint() { return true; }
    /**
     * Initializes the Fibonacci Retracement tool.
     *
     * **Tutorial Note on Construction:**
     * 1. **Deep Copy:** It performs a `deepCopy` of the `FibRetracementOptionDefaults` to ensure
     *    this tool instance has its own unique levels array that won't affect other instances.
     * 2. **Merge:** It merges the user's `options` to allow custom level colors or visibility.
     * 3. **View:** It assigns the `LineToolFibRetracementPaneView`, which handles the heavy lifting
     *    of iterating through levels and drawing lines and fills.
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
        // 1. Create a deep copy of the canonical default options.
        const finalOptions = deepCopy(FibRetracementOptionDefaults);
        // 2. Merge the user-provided 'options' into this unique deep-copied base.
        merge(finalOptions, options);
        // 3. Call the BaseLineTool constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, 'FibRetracement', 2, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('FibRetracement').
         *
         * @override
         */
        this.toolType = 'FibRetracement';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Fib Retracement requires exactly **2 points** to define the range.
         *
         * @override
         */
        this.pointsCount = 2;
        // 4. Set the PaneView.
        this._setPaneViews([new LineToolFibRetracementPaneView(this, this._chart, this._series)]);
    }
    /**
     * Calculates the exact logical coordinates (Time and Price) for every configured Fibonacci level.
     *
     * **Tutorial Note on the Math:**
     * 1. It calculates the vertical range (Price Difference) between the two defining points (P0 and P1).
     * 2. For each coefficient (e.g., 0.618), it calculates the resulting price: `Price = P1 - (Range * Coefficient)`.
     * 3. It generates two logical points per level, spanning horizontally between the min/max time of the anchors.
     *
     * This method serves as the "Calculated Data Source" for both the rendering logic and the culling engine.
     *
     * @returns An array of level data, including the start/end logical points, the raw price, and the coefficient.
     */
    getLineSegmentPoints() {
        const points = this.points();
        if (points.length < 2)
            return [];
        const [p0, p1] = points;
        const options = this.options();
        const priceDiff = p1.price - p0.price;
        const tMin = Math.min(p0.timestamp, p1.timestamp);
        const tMax = Math.max(p0.timestamp, p1.timestamp);
        const segmentPoints = [];
        for (const level of options.levels) {
            // Calculate high-precision price
            const rawPrice = p1.price - (priceDiff * level.coeff);
            // FIX: Use rawPrice directly. 
            // 1. It handles negative numbers correctly.
            // 2. The PaneView will handle rounding for the text label display.
            // 3. The Chart handles floats for coordinate positioning perfectly.
            const price = rawPrice;
            const startPoint = { timestamp: tMin, price: price };
            const endPoint = { timestamp: tMax, price: price };
            segmentPoints.push({
                start: startPoint,
                end: endPoint,
                price: price,
                coeff: level.coeff,
            });
        }
        return segmentPoints;
    }
    /**
     * Flattens all calculated Fibonacci levels into a single array of logical points for the culling engine.
     *
     * **Why is this needed?**
     * The culling engine requires a flat list of points to perform its geometric intersection tests.
     * Since a Fib Retracement isn't just one line but a collection of many, this helper ensures
     * every level is accounted for when determining if the tool should be rendered.
     *
     * @returns A flat array of `LineToolPoint` objects representing every level.
     */
    getAllLogicalPointsForCulling() {
        const segments = this.getLineSegmentPoints();
        const allLogicalPoints = [];
        // The culler needs a single array of points to index into.
        for (const segment of segments) {
            allLogicalPoints.push(segment.start);
            allLogicalPoints.push(segment.end);
        }
        return allLogicalPoints;
    }
    /**
     * Intentionally empty override to prevent automatic point sorting.
     *
     * **Tutorial Note:**
     * In many tools, sorting points by time (Left-to-Right) is helpful. However, in a Fibonacci
     * Retracement, the **direction** of the draw (High-to-Low vs. Low-to-High) defines whether
     * the tool measures a "Retracement" or an "Extension".
     *
     * By disabling normalization, we preserve the user's intended directionality.
     *
     * @override
     */
    normalize() {
        // Do not normalize. Direction is important for user intent.
    }
    /**
     * Implements a horizontal lock (Price Lock) constraint when the Shift key is held during editing.
     *
     * **Logic Details:**
     * When dragging an anchor point while holding Shift, the tool locks the movement to the
     * anchor's **original Price level**. This allows the user to slide the Fibonacci tool
     * left or right across the timeline to align with different bars without accidentally
     * shifting the vertical price range.
     *
     * @param pointIndex - The index of the anchor being dragged.
     * @param rawScreenPoint - The current mouse position.
     * @param phase - The interaction phase (Creation or Editing).
     * @param originalLogicalPoint - The snapshot of the point's logical state before the drag began.
     * @param allOriginalLogicalPoints - The full state of all points before the drag began.
     * @returns The constrained result locking the Y-axis to the original price.
     * @override
     */
    getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, allOriginalLogicalPoints) {
        // We need to determine which Logical Point determines the Y-level.
        let referenceLogicalPoint = null;
        if (phase === InteractionPhase.Creation) ;
        else {
            // EDITING Behavior (User Request):
            // When editing P0 or P1, holding shift should lock it to its ORIGINAL price.
            // This allows sliding the point left/right without changing the price level.
            // 'originalLogicalPoint' IS the snapshot of the point being dragged.
            referenceLogicalPoint = originalLogicalPoint;
        }
        if (!referenceLogicalPoint) {
            return { point: rawScreenPoint, snapAxis: 'none' };
        }
        // Convert the reference logical price to a screen Y coordinate
        const referenceScreenPoint = this.pointToScreenPoint(referenceLogicalPoint);
        if (!referenceScreenPoint) {
            return { point: rawScreenPoint, snapAxis: 'none' };
        }
        // Lock Y to the reference, keep X from the mouse
        return {
            point: new Point(rawScreenPoint.x, referenceScreenPoint.y),
            snapAxis: 'price',
        };
    }
    /**
     * Performs a hit test for the Fibonacci tool by delegating to its associated Pane View.
     *
     * **Architecture Note:**
     * Because this tool renders many independent segments (lines) and areas (fills),
     * the logic for "What did the user click?" is most accurately handled by the View's
     * `CompositeRenderer`.
     *
     * Calling `renderer()` on the view ensures the visual state is up-to-date before the
     * hit-test is performed.
     *
     * @param x - X coordinate in pixels.
     * @param y - Y coordinate in pixels.
     * @returns A hit result if the mouse is over any line, fill, or handle, otherwise `null`.
     * @override
     */
    _internalHitTest(x, y) {
        if (!this._paneViews || this._paneViews.length === 0 || !this._paneViews[0]) {
            return null;
        }
        const paneView = this._paneViews[0];
        paneView.renderer(); // Ensure the view is updated
        const compositeRenderer = paneView.renderer();
        if (!compositeRenderer || !compositeRenderer.hitTest) {
            return null;
        }
        return compositeRenderer.hitTest(x, y);
    }
}

// /lightweight-charts-line-tools-fib-retracement/src/index.ts
/**
 * This is the main entry point for the 'lightweight-charts-line-tools-fib-retracement' plugin.
 * It exports the LineToolFibRetracement class and a registration function for the core plugin.
 */
// Import the main LineToolFibRetracement class
// Define the name under which this specific tool will be registered
const FIB_RETRACEMENT_NAME = 'FibRetracement';
/**
 * Registers the Fibonacci Retracement tool with the provided Core Plugin instance.
 *
 * @param corePlugin - The instance of the Core Line Tools Plugin.
 * @returns void
 *
 * @example
 * ```ts
 * registerFibRetracementPlugin(corePlugin);
 * ```
 */
function registerFibRetracementPlugin(corePlugin) {
    // Register the LineToolFibRetracement Class
    corePlugin.registerLineTool(FIB_RETRACEMENT_NAME, LineToolFibRetracement);
    console.log(`Registered Line Tool: ${FIB_RETRACEMENT_NAME}`);
}

export { LineToolFibRetracement, registerFibRetracementPlugin as default, registerFibRetracementPlugin };
//# sourceMappingURL=lightweight-charts-line-tools-fib-retracement.js.map
