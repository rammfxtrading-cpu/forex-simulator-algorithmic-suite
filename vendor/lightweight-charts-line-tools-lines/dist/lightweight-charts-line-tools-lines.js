import { LineStyle } from 'lightweight-charts';
import { LineToolPaneView, SegmentRenderer, TextRenderer, getToolCullingState, OffScreenState, deepCopy, LineJoin, LineCap, BoxHorizontalAlignment, AnchorPoint, PaneCursorType, BoxVerticalAlignment, TextAlignment, LineEnd, BaseLineTool, merge, InteractionPhase, Point, CompositeRenderer } from 'lightweight-charts-line-tools-core';

// /src/views/LineToolTrendLinePaneView.ts
/**
 * The specific Pane View implementation for the Trend Line tool.
 *
 * **Tutorial Note on Views:**
 * This class demonstrates the standard responsibility of a Pane View in the plugin architecture:
 * 1. **Data Conversion:** It translates the Model's logical points (Time/Price) into Screen points (X/Y pixels).
 * 2. **Culling:** It checks if the tool is actually visible on screen to optimize performance.
 * 3. **Composition:** It configures and combines multiple low-level renderers (Segment, Text, Anchors)
 *    into a single `CompositeRenderer` for the chart to draw.
 */
class LineToolTrendLinePaneView extends LineToolPaneView {
    /**
     * Initializes the Trend Line View.
     *
     * @param source - The specific Trend Line model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        super(source, chart, series);
        this._segmentRenderer = new SegmentRenderer();
        this._textRenderer = new TextRenderer();
    }
    /**
     * Retrieves the internal `SegmentRenderer` instance used to draw the main line.
     *
     * This can be useful for derived classes (like `LineToolArrowPaneView`) if they need
     * to inspect or modify the renderer's state directly, though usually configuration is done via options.
     *
     * @returns The active {@link SegmentRenderer}.
     */
    getSegmentRenderer() {
        return this._segmentRenderer;
    }
    /**
     * Retrieves the final `CompositeRenderer` for the current render cycle.
     *
     * **Architecture Note:**
     * This override ensures that `_updateImpl` is called if the view is marked as invalidated.
     * This "lazy update" pattern ensures that expensive geometry calculations (like text rotation
     * or culling) only happen once per frame, just before drawing.
     *
     * @returns The fully configured {@link IPrimitivePaneRenderer}, or `null` if nothing should be drawn.
     * @override
     */
    renderer() {
        // Call the base renderer method to ensure the composite is built/updated
        // NOTE: The logic in _updateImpl builds the composite. 
        // We just need to expose the result after it's built.
        if (this._invalidated) {
            this._updateImpl(0, 0); // Need to pass dimensions if they are required for _updateImpl to build the composite
        }
        return this._renderer; // Assumes _renderer is the CompositeRenderer
    }
    /**
     * The core update logic for the Trend Line View.
     *
     * This method is responsible for translating the tool's data model into visual renderers.
     * It performs visibility checks (culling), coordinates conversion, and configures
     * the sub-renderers (Segment and Text) based on the current options.
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const options = this._tool.options();
        if (!options.visible) {
            return;
        }
        if (this._tool.points().length < this._tool.pointsCount) {
            // Do not cull if actively being drawn, but exit if points are insufficient for a line segment.
            return;
        }
        const points = this._tool.points();
        // --- CULLING IMPLEMENTATION START ---
        /**
         * 1. CULLING & VISIBILITY CHECK
         *
         * We rely on the `getToolCullingState` utility to determine if this tool intersects the viewport.
         * - We pass `options.line.extend` so the culler knows to calculate intersections for infinite lines (Rays).
         * - We cast `_tool` to `BaseLineTool` to allow access to Chart APIs for viewport calculation.
         * - If `cullingState` is anything other than `Visible`, we exit immediately to save performance.
         */
        const cullingState = getToolCullingState(points, this._tool, options.line.extend);
        let shouldCull = false;
        // 2. Apply Custom Culling Logic based on State and Extension Configuration
        switch (cullingState) {
            case OffScreenState.OffScreenTop:
                shouldCull = true;
                break;
            case OffScreenState.OffScreenBottom:
                shouldCull = true;
                break;
            case OffScreenState.OffScreenLeft:
                shouldCull = true;
                break;
            case OffScreenState.OffScreenRight:
                shouldCull = true;
                break;
            case OffScreenState.FullyOffScreen:
                shouldCull = true;
                break;
            case OffScreenState.Visible:
            default:
                shouldCull = false;
                break;
        }
        if (shouldCull) {
            //console.log('trend line culled');
            return; // Exit early if culled
        }
        // --- CULLING IMPLEMENTATION END ---
        // 3. If Visible, proceed with coordinate conversion and rendering setup
        const hasScreenPoints = this._updatePoints(); // Converts logical points to screen coordinates (_points array)
        if (!hasScreenPoints) {
            return;
        }
        const [point0, point1] = this._points; // Screen coordinates
        const segmentPoints = [point0, point1];
        // --- Setup Renderers ---
        // 1. Segment Renderer (The TrendLine itself)
        // FIX for Omitted Properties: Re-introduce defaults for 'join' and 'cap'
        const lineOptions = deepCopy(options.line); // Cast to any for modification
        lineOptions.join = lineOptions.join || LineJoin.Miter;
        lineOptions.cap = lineOptions.cap || LineCap.Butt;
        /**
         * 2. SEGMENT RENDERER CONFIGURATION
         *
         * We configure the `SegmentRenderer` to draw the main line.
         * - `points`: The screen coordinates converted from the model.
         * - `line`: Visual styling (color, width, dashes) and end-caps (arrows).
         * - `toolDefault...`: We pass the cursor styles (e.g., 'pointer') so the renderer's internal
         *   hit-test can suggest the correct cursor to the chart when hovering over the line.
         */
        // Calculate text gap if text has a value
        let textGap = null;
        if (options.text && options.text.value) {
            const fontSize = options.text.font?.size || 12;
            const textLen = options.text.value.length;
            const estimatedHalfW = (fontSize * 0.55 * textLen) / 2 + 1;
            const [pt0, pt1] = this._points;
            // Calculate cx based on horizontal alignment
            const hAlign = (options.text.box?.alignment?.horizontal || 'center').toLowerCase();
            let cx, cy;
            if (hAlign === 'left') {
                cx = pt0.x + estimatedHalfW;
                cy = pt0.y;
            } else if (hAlign === 'right') {
                cx = pt1.x - estimatedHalfW;
                cy = pt1.y;
            } else {
                cx = (pt0.x + pt1.x) / 2;
                cy = (pt0.y + pt1.y) / 2;
            }
            textGap = { cx, cy, halfW: estimatedHalfW, halfH: fontSize / 2 };
        }
        this._segmentRenderer.setData({
            points: segmentPoints,
            textGap,
            line: lineOptions,
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        });
        this._renderer.append(this._segmentRenderer);
        // 2. Text Renderer (if any text is provided)
        if (options.text.value) {
            // Get screen points (known to exist if we are here)
            const [point0, point1] = this._points;
            // --- 1. Text Logic: Determine the Text Box Pivot/Attachment Point ---
            let textLocationPoint;
            const horizontalAlignment = (options.text.box?.alignment?.horizontal || '').toLowerCase();
            // Check for the three standard alignment points on the segment (P0, P1, Midpoint)
            if (horizontalAlignment === BoxHorizontalAlignment.Left.toLowerCase()) {
                textLocationPoint = point0; // Attach to the first point of the line
            }
            else if (horizontalAlignment === BoxHorizontalAlignment.Right.toLowerCase()) {
                textLocationPoint = point1; // Attach to the second point of the line
            }
            else {
                // Default to center (or any other unspecified alignment)
                const lineMidpointX = (point0.x + point1.x) / 2;
                const lineMidpointY = (point0.y + point1.y) / 2;
                textLocationPoint = new AnchorPoint(lineMidpointX, lineMidpointY, 0);
            }
            const textAttachmentPoint = textLocationPoint;
            // --- 2. Angle Calculation (Cumulative Rotation) ---
            const dx = point1.x - point0.x;
            const dy = point1.y - point0.y;
            const angleRadians = Math.atan2(dy, dx);
            // Line Slope Angle (The Base Rotation)
            const finalAngleRadians = -angleRadians;
            const lineSlopeAngleDegrees = finalAngleRadians * (180 / Math.PI);
            // Retrieve the User's Intended Angle Offset
            const userAngleOffsetDegrees = options.text.box?.angle || 0;
            // Calculate the Final Cumulative Angle (Slope Angle + User Offset)
            const finalCumulativeAngleDegrees = lineSlopeAngleDegrees + userAngleOffsetDegrees;
            // 3. Setup Text Options and Renderer Data ---
            // Create deep copy of text options
            const textOptions = deepCopy(options.text);
            // Overwrite the angle property with the Final Cumulative Angle
            textOptions.box = { ...textOptions.box, angle: finalCumulativeAngleDegrees };
            /**
             * 3. TEXT RENDERER DATA SETUP
             *
             * This structure defines how the text box is drawn relative to the line.
             * - `points`: The pivot/attachment point. We pass it twice to satisfy the interface,
             *    but for point-attached text, the renderer focuses on the first point.
             * - `text`: The full configuration. Crucially, this object already contains the
             *    `finalCumulativeAngleDegrees` calculated above, ensuring rotation parallel to the line.
             * - `hitTestBackground`: Enables selection by clicking anywhere on the text box.
             */
            const textRendererData = {
                // Text box dimensions are defined by the area between these two points.
                // For text attached to a point, we use two identical points.
                points: [textAttachmentPoint, textAttachmentPoint],
                text: textOptions,
                // Set up hit testing for the text box area
                hitTestBackground: true,
                toolDefaultHoverCursor: options.defaultHoverCursor,
                toolDefaultDragCursor: options.defaultDragCursor,
            };
            this._textRenderer.setData(textRendererData);
            this._renderer.append(this._textRenderer);
        }
        // 3. Line Anchors (Handles for P1 and P2)
        //if (this.areAnchorsVisible()) {
        this._addAnchors(this._renderer);
        //}
    }
    /**
     * Adds the interactive anchor points (handles) to the renderer.
     *
     * For a Trend Line, this places two handles:
     * - One at the Start Point (P0).
     * - One at the End Point (P1).
     *
     * It assigns the `DiagonalNwSeResize` cursor to both, indicating to the user that
     * these points can be dragged freely in 2D space.
     *
     * @param renderer - The composite renderer to append anchors to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        if (this._points.length < 2)
            return;
        const [point0, point1] = this._points;
        // The two anchor points (P1 and P2)
        const anchorData = {
            points: [point0, point1],
            pointsCursorType: [PaneCursorType.DiagonalNwSeResize, PaneCursorType.DiagonalNwSeResize],
        };
        // Add the single LineAnchorRenderer set (which renders both P1 and P2)
        renderer.append(this.createLineAnchor(anchorData, 0));
    }
}

// /src/model/LineToolTrendLine.ts
/**
 * Defines the default configuration options for the Trend Line tool.
 *
 * These defaults serve as the baseline for the Trend Line itself, but are also exported
 * and reused by derived tools (like Ray, Arrow, and Extended Line) to ensure visual consistency
 * across all 2-point line tools.
 *
 * Key defaults include:
 * - Color: Blue (`#2962ff`)
 * - Width: 1px
 * - Style: Solid
 * - Extensions: None (a finite segment)
 * - End Caps: Normal (no arrows)
 */
const TrendLineOptionDefaults = {
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
    // Specific Options for TrendLineToolOptions
    line: {
        width: 1,
        color: '#2962ff', // default blue
        style: LineStyle.Solid,
        extend: { left: false, right: false },
        end: { left: LineEnd.Normal, right: LineEnd.Normal },
    },
    text: {
        value: '',
        padding: 0,
        wordWrapWidth: 0,
        forceTextAlign: false,
        forceCalculateMaxLineWidth: false,
        alignment: TextAlignment.Center,
        font: { family: 'sans-serif', color: '#2962ff', size: 12, bold: false, italic: false },
        box: {
            scale: 1,
            angle: 0,
            alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center },
            // Default box and shadow options
        },
    }, // Ensure the structure of TextOptions is complete if TextToolOptions requires it
};
/**
 * Concrete implementation of the standard Trend Line drawing tool.
 *
 * A Trend Line is the fundamental 2-point geometry tool. It connects a start point (P1)
 * and an end point (P2) with a straight line.
 *
 * **Tutorial Note on Inheritance:**
 * This class is designed to be extended. Tools like `LineToolRay`, `LineToolArrow`, and
 * `LineToolExtendedLine` inherit from this class because they share the exact same
 * input logic (2 points) and interaction rules. They only differ in their visual
 * options (e.g., `extend.right = true` for a Ray).
 */
class LineToolTrendLine extends BaseLineTool {
    /**
     * Explicitly defines the highest valid index for an interactive anchor point.
     *
     * Since `pointsCount` is 2, the valid indices are 0 and 1. Therefore, the maximum index is 1.
     * The `InteractionManager` uses this to ensure it tracks drag gestures for both ends of the line.
     *
     * @override
     * @returns `1`
     */
    maxAnchorIndex() {
        return 1; // Anchors are indexed from 0 to 1.
    }
    /**
     * Confirms that this tool can be created via the "Click-Click" method.
     *
     * **Interaction Flow:**
     * 1. User clicks once to set the Start Point (P1).
     * 2. User moves the mouse (ghost line follows).
     * 3. User clicks again to set the End Point (P2).
     *
     * @override
     * @returns `true`
     */
    supportsClickClickCreation() {
        return true; // TrendLine supports click-click creation
    }
    /**
     * Confirms that this tool can be created via the "Click-Drag" method.
     *
     * **Interaction Flow:**
     * 1. User presses mouse down to set the Start Point (P1).
     * 2. User drags the mouse while holding the button.
     * 3. User releases the mouse button to set the End Point (P2).
     *
     * @override
     * @returns `true`
     */
    supportsClickDragCreation() {
        return true; // TrendLine supports click-drag creation
    }
    /**
     * Enables geometric constraints (Shift key) during "Click-Click" creation.
     *
     * If `true`, holding Shift while hovering to place the second point will lock the line
     * to specific angles (e.g., horizontal, vertical, or 45-degree increments).
     *
     * @override
     * @returns `true`
     */
    supportsShiftClickClickConstraint() {
        return true; // TrendLine supports Shift constraint during click-click creation
    }
    /**
     * Enables geometric constraints (Shift key) during "Click-Drag" creation.
     *
     * If `true`, holding Shift while dragging to place the second point will lock the line
     * to specific angles.
     *
     * @override
     * @returns `true`
     */
    supportsShiftClickDragConstraint() {
        return true; // TrendLine supports Shift constraint during click-drag creation
    }
    /**
     * Initializes the Trend Line tool.
     *
     * **Tutorial Note on Logic:**
     * 1. It starts with the `TrendLineOptionDefaults`.
     * 2. It merges any user-provided `options` on top.
     * 3. It instantiates the specific `LineToolTrendLinePaneView`, which handles the actual canvas rendering.
     *
     * @param coreApi - The Core Plugin API.
     * @param chart - The Lightweight Charts Chart API.
     * @param series - The Series API this tool is attached to.
     * @param horzScaleBehavior - The horizontal scale behavior for time conversion.
     * @param options - Configuration overrides.
     * @param points - Initial points (if restoring state).
     * @param priceAxisLabelStackingManager - The manager for label collision.
     */
    constructor(coreApi, chart, series, horzScaleBehavior, options = {}, points = [], priceAxisLabelStackingManager) {
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        merge(finalOptions, options);
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, 'TrendLine', 2, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('TrendLine').
         *
         * @override
         */
        this.toolType = 'TrendLine';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Trend Line always consists of exactly **2 points** (Start and End).
         *
         * @override
         */
        this.pointsCount = 2;
        // A PaneView is responsible for rendering the tool on the chart.
        this._setPaneViews([new LineToolTrendLinePaneView(this, this._chart, this._series)]);
    }
    /**
     * Implements the specific geometric constraint logic when the user holds the Shift key while drawing or editing.
     *
     * **Tutorial Note:**
     * For a standard Trend Line, holding Shift triggers a **Price Lock** (Horizontal Lock).
     * 1. It identifies the "Anchor Point" (the point *not* being moved).
     * 2. It takes the Y-coordinate (Price) of that anchor.
     * 3. It forces the point being moved to align with that Y-coordinate.
     *
     * This allows users to easily draw perfectly horizontal lines by holding Shift.
     *
     * @param pointIndex - The index of the point being moved (0 or 1).
     * @param rawScreenPoint - The actual mouse position on screen.
     * @param phase - Whether we are creating the tool or editing an existing one.
     * @param originalLogicalPoint - The logical position of the point being moved before the drag started.
     * @param allOriginalLogicalPoints - The state of all points before the drag started.
     * @returns A result containing the constrained screen point and a hint ('price') that we snapped to a specific price level.
     * @override
     */
    getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, // This is the *dragged* point's original logical state
    allOriginalLogicalPoints // This is the *entire array* of all points' original logical states
    ) {
        // The Y-constraint always comes from the "other" (non-moving) point.
        let constraintSourceLogicalPoint = null;
        if (phase === InteractionPhase.Creation) {
            // During Creation, P0 (index 0) is the fixed point, and P1 (index 1) is being dragged.
            // The constraint is always on P0's original Y-position.
            // In the InteractionManager, for creation, 'originalLogicalPoint' is P0's position.
            constraintSourceLogicalPoint = originalLogicalPoint; // P0's original position
        }
        else { // InteractionPhase.Editing
            // During Editing, the constraint is on the *other* anchor's original Y-position.
            // If pointIndex is 0, constraint is from P1 (index 1). If pointIndex is 1, constraint is from P0 (index 0).
            const otherPointIndex = pointIndex === 0 ? 1 : 0;
            constraintSourceLogicalPoint = allOriginalLogicalPoints[otherPointIndex];
        }
        if (!constraintSourceLogicalPoint) {
            // Safety fallback: if the constraint source point doesn't exist, return raw.
            return { point: rawScreenPoint, snapAxis: 'none' };
        }
        // Convert the constraint source's logical position to its current screen coordinates
        const constraintSourceScreenPoint = this.pointToScreenPoint(constraintSourceLogicalPoint);
        if (!constraintSourceScreenPoint) {
            // Safety fallback: if conversion fails, return the raw mouse point.
            return { point: rawScreenPoint, snapAxis: 'none' };
        }
        // Apply the Constraint: Force the new point's Y-coordinate to match the Y-coordinate of the constraint source.
        const constrainedY = constraintSourceScreenPoint.y;
        // Return the new screen point (X from raw mouse, Y from constraint source)
        return {
            point: new Point(rawScreenPoint.x, constrainedY),
            snapAxis: 'price',
        };
    }
    /**
     * Re-orders the internal points so that the start point (P0) is always chronologically earlier
     * (to the left) than the end point (P1).
     *
     * **Why is this needed?**
     * Many rendering calculations (especially for Rays or Extended Lines) assume directionality.
     * By ensuring P0 is always the "left" point, we simplify the math for drawing extensions "to the right".
     *
     * @remarks
     * If the points share the exact same time, the Price is used as a tie-breaker to ensure
     * deterministic ordering.
     */
    normalize() {
        if (this._points.length < 2) {
            return;
        }
        // Use local variables to avoid accessing _points multiple times during conditional checks
        let [p0, p1] = this._points;
        // The primary check is Time. If P0 > P1 in time, they must be swapped.
        if (p0.timestamp > p1.timestamp) {
            this._points = [p1, p0]; // Swap the references in the array
            return;
        }
        // Tie-Breaker: If times are identical (vertical line segment)
        if (p0.timestamp === p1.timestamp) {
            // Use price as a stable tie-breaker to ensure a predictable order (e.g., P0 is always the lower price)
            if (p0.price > p1.price) {
                this._points = [p1, p0]; // Swap if P0 is higher price
                return;
            }
            // If prices are identical, no swap is necessary, and the tool is effectively a single point.
        }
        // If no swap was necessary, the array remains [p0, p1], and they are already in the correct order.
    }
    /**
     * Updates the logical coordinates of a specific anchor point.
     *
     * While this implementation currently delegates directly to the base class, overriding it here
     * allows the Trend Line to intercept point updates if custom validation logic were needed in the future.
     *
     * @param index - The index of the point to update (0 or 1).
     * @param point - The new logical coordinates.
     * @override
     */
    setPoint(index, point) {
        // The InteractionManager should handle the actual constraint (Y = P1.Y) based on ShiftKey.
        // We can simply pass the constrained point to the base model.
        super.setPoint(index, point);
    }
    /**
     * Performs the hit test to see if the mouse is hovering over this tool.
     *
     * **Architecture Note:**
     * The **Model** (this class) knows *data* (time/price), but it doesn't know *pixels* (where lines are drawn).
     * The **View** (`LineToolTrendLinePaneView`) knows pixels.
     *
     * Therefore, this method retrieves the active Pane View and asks its **Composite Renderer**
     * to perform the hit test. This ensures that what the user *sees* is exactly what they *click*.
     *
     * @param x - X coordinate in pixels.
     * @param y - Y coordinate in pixels.
     * @returns A hit result if the mouse is over the line or an anchor, otherwise `null`.
     * @override
     */
    _internalHitTest(x, y) {
        // This guards against hitTest being called after the tool has been destroyed and _paneViews cleared.
        if (!this._paneViews || this._paneViews.length === 0 || !this._paneViews[0]) {
            return null;
        }
        // 1. Get the PaneView that contains the Composite Renderer
        const paneView = this._paneViews[0];
        // 2. Get the Composite Renderer from the PaneView
        const compositeRenderer = paneView.renderer(); // Type assert to Composite
        if (!compositeRenderer || !compositeRenderer.hitTest) {
            return null;
        }
        // 3. Delegate the hit test to the Composite Renderer
        const hitResult = compositeRenderer.hitTest(x, y);
        // This Composite Renderer will automatically prioritize the Anchor hit (ChangePoint)
        // over the Segment hit (MovePointBackground) because Anchors are appended LAST
        // and the CompositeRenderer iterates backwards for hit testing priority.
        return hitResult;
    }
}

// /src/views/LineToolExtendedLinePaneView.ts
/**
 * Pane View for the Extended Line tool.
 *
 * **Inheritance Note:**
 * This class inherits directly from {@link LineToolTrendLinePaneView}.
 *
 * **Why no rendering logic?**
 * An Extended Line is geometrically identical to a Trend Line (defined by 2 points).
 * The visual difference (infinite extension in both directions) is controlled entirely
 * by the tool's options (`extend: { left: true, right: true }`).
 *
 * The parent view's `_updateImpl` method passes these options to the `SegmentRenderer`,
 * which contains the mathematical logic to clip infinite lines to the viewport.
 * Therefore, this view requires no custom drawing code.
 */
class LineToolExtendedLinePaneView extends LineToolTrendLinePaneView {
    /**
     * Initializes the Extended Line View.
     *
     * @param source - The specific Extended Line model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        // Call the parent constructor (LineToolTrendLinePaneView)
        super(source, chart, series);
    }
}

// /src/model/LineToolExtendedLine.ts
/**
 * Defines the specific configuration overrides that transform a standard Trend Line into an Extended Line.
 *
 * **Tutorial Note:**
 * The key characteristic of an Extended Line is that it spans the entire chart indefinitely,
 * passing through its two defining points.
 *
 * This override sets both `extend.left` and `extend.right` to `true`. The underlying
 * `SegmentRenderer` reads these flags and automatically handles the mathematics to calculate
 * the intersections with the viewport boundaries.
 */
const ExtendedLineSpecificOverrides = {
    line: {
        extend: { left: true, right: true },
    }
};
/**
 * Concrete implementation of the Extended Line drawing tool.
 *
 * **What is an Extended Line?**
 * Structurally, it is identical to a {@link LineToolTrendLine} (defined by two points).
 * Visually, it draws a line that passes through these two points and continues infinitely
 * in both directions across the chart.
 *
 * **Inheritance:**
 * It extends {@link LineToolTrendLine} to reuse the point handling, hit testing, and normalization logic.
 * The difference is purely configuration (extensions enabled) and the specific View class used.
 */
class LineToolExtendedLine extends LineToolTrendLine {
    /**
     * Initializes the Extended Line tool.
     *
     * **Tutorial Note on Option Merging:**
     * 1. **Base Defaults:** Start with `TrendLineOptionDefaults`.
     * 2. **Subclass Overrides:** Merge `ExtendedLineSpecificOverrides` to force `extend: { left: true, right: true }`.
     * 3. **User Options:** Merge the `options` passed by the user.
     *
     * This setup ensures the line extends infinitely by default, but still allows the user to
     * customize other aspects like color, width, or text.
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
        // 1. Start with a deep copy of the base TrendLine defaults.
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Merge the ExtendedLineSpecificOverrides over the base defaults.
        //    This sets the default behavior to extend both ways.
        merge(finalOptions, deepCopy(ExtendedLineSpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        merge(finalOptions, options);
        // 4. Call the parent (LineToolTrendLine) constructor with the customized options.
        // The parent constructor is effectively the BaseLineTool constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('ExtendedLine').
         *
         * @override
         */
        this.toolType = 'ExtendedLine';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * An Extended Line requires exactly **2 points** to define the slope and position of the infinite line.
         *
         * @override
         */
        this.pointsCount = 2; // Still a 2-point tool
        // 3. Set the specific PaneView for this tool (optional, but good practice for consistency)
        // NOTE: LineToolExtendedLinePaneView must be created next, inheriting from the TrendLine view.
        this._setPaneViews([new LineToolExtendedLinePaneView(this, this._chart, this._series)]);
        console.log(`ExtendedLine Tool created with ID: ${this.id()}`);
    }
}

// /src/views/LineToolArrowPaneView.ts
/**
 * Pane View for the Arrow tool.
 *
 * **Inheritance Note:**
 * This class extends {@link LineToolTrendLinePaneView} directly.
 *
 * **Why no rendering logic?**
 * The Arrow tool is geometrically identical to a Trend Line (2 points). The distinction
 * (the arrow head) is defined purely in the Model's options (`line.end.right`).
 * The parent view's `_updateImpl` reads these options and passes them to the
 * `SegmentRenderer`, which handles drawing the arrow cap automatically. Therefore,
 * this class requires no custom drawing code.
 */
class LineToolArrowPaneView extends LineToolTrendLinePaneView {
    /**
     * Initializes the Arrow Pane View.
     *
     * @param source - The specific Arrow model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, // Use the specific model class for strong typing
    chart, series) {
        // Call the parent constructor (LineToolTrendLinePaneView)
        // We cast 'source' to the common parent type if needed, but since LineToolArrow extends 
        // LineToolTrendLine, and the pane view is designed to handle this inheritance, 
        // passing the specific model instance is fine.
        super(source, chart, series);
    }
}

// /src/model/LineToolArrow.ts
/**
 * Defines the specific configuration overrides that turn a standard Trend Line into an Arrow tool.
 *
 * **Tutorial Note:**
 * Instead of creating a whole new class with new drawing logic, we simply take the
 * base Trend Line options and override specific properties. Here, we force the
 * `line.end.right` property to be `LineEnd.Arrow`.
 *
 * This object is merged *after* the base defaults but *before* user options, ensuring the
 * arrow tip appears by default while still allowing user customization.
 */
const ArrowSpecificOverrides = {
    line: {
        end: { right: LineEnd.Arrow }, // Key change: Arrow end on the right side
    }
};
/**
 * Concrete implementation of the Arrow drawing tool.
 *
 * **Tutorial Note on Inheritance:**
 * The Arrow tool is structurally identical to a standard Trend Line (it connects a start point to an end point).
 * Therefore, instead of rewriting geometry or hit-testing logic, this class simply extends {@link LineToolTrendLine}.
 *
 * The only difference is purely visual: this class forces the "Right End" of the line
 * to be drawn as an Arrow head by default. This demonstrates the power of the plugin architecture:
 * you can create distinct tools just by applying specific option presets to a base class.
 */
class LineToolArrow extends LineToolTrendLine {
    /**
     * Initializes the Arrow tool.
     *
     * **Tutorial Note on Option Merging:**
     * This constructor demonstrates the correct hierarchy for applying options in a derived tool:
     * 1. **Base Defaults:** Start with `TrendLineOptionDefaults` to get standard line/text settings.
     * 2. **Subclass Overrides:** Merge `ArrowSpecificOverrides` (which sets `line.end.right = LineEnd.Arrow`).
     * 3. **User Options:** Merge the `options` passed by the user.
     *
     * This order ensures that the Arrow always looks like an arrow by default, but the user
     * still has the final say (e.g., they could theoretically turn off the arrow tip via options).
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
        // 1. Start with a deep copy of the base TrendLine defaults.
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Merge the ArrowSpecificOverrides over the base defaults.
        //  This sets the default behavior to have an arrow end.
        merge(finalOptions, deepCopy(ArrowSpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        //    This ensures user options can override the default arrow end if desired.
        merge(finalOptions, options);
        // 4. Call the parent (LineToolTrendLine) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('Arrow').
         *
         * @override
         */
        this.toolType = 'Arrow';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * Like its parent Trend Line, an Arrow is defined by exactly **2 points** (Tail and Head).
         *
         * @override
         */
        this.pointsCount = 2; // Still a 2-point tool
        // 5. Set the specific PaneView for this tool.
        this._setPaneViews([new LineToolArrowPaneView(this, this._chart, this._series)]);
        console.log(`Arrow Tool created with ID: ${this.id()}`);
    }
}

// /src/views/LineToolRayPaneView.ts
/**
 * Pane View for the Ray tool.
 *
 * **Inheritance Note:**
 * This class inherits directly from {@link LineToolTrendLinePaneView}.
 *
 * The core logic for drawing a 2-point line (whether segment, ray, or extended line)
 * is fully encapsulated in the parent class. The distinction for the Ray (infinite extension
 * to the right) is defined in the tool's options (`extend.right = true`). The parent view
 * reads these options and configures the renderer automatically.
 */
class LineToolRayPaneView extends LineToolTrendLinePaneView {
    /**
     * Initializes the Ray View.
     *
     * @param source - The specific Ray model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, // Use the specific model class for strong typing
    chart, series) {
        // Call the parent constructor (LineToolTrendLinePaneView)
        super(source, chart, series);
    }
}

// /src/model/LineToolRay.ts
/**
 * Defines the specific configuration overrides that transform a standard Trend Line into a Ray.
 *
 * **Tutorial Note:**
 * A Ray is a line that starts at a specific point (P1) and passes through a second point (P2),
 * extending infinitely in that direction.
 *
 * This override sets `line.extend.right` to `true`. The underlying renderer detects this
 * and calculates the intersection with the right edge of the chart viewport.
 */
const RaySpecificOverrides = {
    line: {
        extend: { right: true }, // Key change: Extended to the right
    }
};
/**
 * Concrete implementation of the Ray drawing tool.
 *
 * **Inheritance:**
 * It extends {@link LineToolTrendLine} directly. This is because a Ray shares the exact same
 * 2-point geometry, hit-testing, and user interaction logic as a Trend Line.
 * The only difference is the visual property of extending to infinity on one side.
 */
class LineToolRay extends LineToolTrendLine {
    /**
     * Initializes the Ray tool.
     *
     * **Tutorial Note on Construction:**
     * 1. **Base Defaults:** Start with `TrendLineOptionDefaults`.
     * 2. **Subclass Overrides:** Merge `RaySpecificOverrides` (forcing `extend.right = true`).
     * 3. **User Options:** Merge the `options` passed by the user.
     *
     * **View Assignment:**
     * It assigns the `LineToolRayPaneView`. While this view currently acts just like a TrendLine view,
     * using a specific class allows future customization of how the Ray is rendered (e.g., adding
     * a specific end-cap only to the infinite end) without breaking the standard Trend Line.
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
        // 1. Start with a deep copy of the base TrendLine defaults.
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Merge the RaySpecificOverrides over the base defaults.
        //    This sets the default behavior to extend right.
        merge(finalOptions, deepCopy(RaySpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        //    This ensures user options can override the default extensions if desired.
        merge(finalOptions, options);
        // 4. Call the parent (LineToolTrendLine) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('Ray').
         *
         * @override
         */
        this.toolType = 'Ray';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * Like the Trend Line, a Ray is defined by exactly **2 points** (Origin and Direction).
         *
         * @override
         */
        this.pointsCount = 2; // Still a 2-point tool
        // 5. Set the specific PaneView for this tool.
        this._setPaneViews([new LineToolRayPaneView(this, this._chart, this._series)]);
        console.log(`Ray Tool created with ID: ${this.id()}`);
    }
}

// /src/views/LineToolHorizontalLinePaneView.ts
/**
 * Pane View for the Horizontal Line tool.
 *
 * **Tutorial Note on Logic:**
 * Unlike a Trend Line which connects two points, a Horizontal Line is defined by a **Single Point**
 * but renders a line that spans the width of the chart (or specific rays based on extension options).
 *
 * This view is responsible for:
 * 1. calculating the visible start and end X-coordinates of the line.
 * 2. Positioning the text label specifically relative to the visible segment (e.g., aligning text to the right edge of the screen).
 */
class LineToolHorizontalLinePaneView extends LineToolPaneView {
    /**
     * Initializes the Horizontal Line View.
     *
     * @param source - The specific Horizontal Line model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        super(source, chart, series);
        /**
         * Internal renderer for the main horizontal line segment.
         * @protected
         */
        this._lineRenderer = new SegmentRenderer();
        /**
         * Internal renderer for the optional text label.
         * @protected
         */
        this._textRenderer = new TextRenderer();
    }
    /**
     * The core update logic.
     *
     * It translates the single logical anchor point into a specific horizontal segment
     * based on the chart's current width and the tool's extension settings.
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const options = this._tool.options();
        if (!options.visible) {
            return;
        }
        const points = this._tool.points();
        if (points.length === 0) {
            return;
        }
        // --- 1. CULLING IMPLEMENTATION ---
        /**
         * CULLING CONFIGURATION
         *
         * A Horizontal Line is defined by a single point but has infinite horizontal extent.
         * We define a `singlePointOrientation` to tell the culling engine that this point represents
         * a line extending infinitely along the X-axis (Time).
         *
         * `getToolCullingState` uses this to determine visibility: the tool is only hidden if
         * the Y-coordinate (Price) is completely off-screen. The X-coordinate is ignored for culling
         * because the line exists at all times.
         */
        const singlePointOrientation = {
            horizontal: true,
            vertical: false,
        };
        // We trust the geometric check to handle all scenarios
        const cullingState = getToolCullingState(points, this._tool, options.line.extend, singlePointOrientation);
        if (cullingState !== OffScreenState.Visible) {
            return; // Exit if culled
        }
        // 2. Coordinate Conversion and Setup
        const hasScreenPoints = this._updatePoints();
        if (!hasScreenPoints) {
            return;
        }
        const [anchorPoint] = this._points; // Screen coordinates of the single anchor
        // --- 3. Bespoke Logic: Dynamic Horizontal Segment Calculation ---
        // The anchor point's X coordinate determines where the line starts/ends if extensions are off.
        /**
         * SEGMENT CALCULATION
         *
         * Since the Model only provides one point (the anchor), we must calculate the
         * Start (X1) and End (X2) of the line to draw.
         *
         * - If `extend.left` is true, X1 is 0.
         * - If `extend.right` is true, X2 is the full pane width.
         * - Otherwise, the line starts/stops at the anchor's X position.
         */
        const anchorX = anchorPoint.x;
        const lineY = anchorPoint.y;
        let startX;
        let endX;
        // --- GET VALIDATED CHART DRAWING WIDTH ---
        // Use the validated method to get the definitive width of the drawing pane of the chart area only.
        //const paneDrawingHeight = this._tool.getChartDrawingHeight();
        const paneDrawingWidth = this._tool.getChartDrawingWidth();
        const { left: extendLeft, right: extendRight } = options.line.extend;
        // Calculate the custom startX
        if (extendLeft) {
            // Full extension to the left edge of the pane (X=0)
            startX = 0;
        }
        else {
            // No left extension: line starts at the anchor's X position
            startX = anchorX;
        }
        // Calculate the custom endX
        if (extendRight) {
            // Full extension to the right edge of the pane (X=width)
            endX = paneDrawingWidth;
        }
        else {
            // No right extension: line ends at the anchor's X position
            endX = anchorX;
        }
        // Define the two points of the segment to be drawn
        const segmentStart = new AnchorPoint(startX, lineY, 0);
        const segmentEnd = new AnchorPoint(endX, lineY, 0); // PointIndex doesn't matter here
        // --- 4. Line Rendering: SegmentRenderer ---
        const lineOptions = deepCopy(options.line);
        lineOptions.join = lineOptions.join || LineJoin.Miter;
        lineOptions.cap = lineOptions.cap || LineCap.Butt;
        /**
         * LINE RENDERER DATA SETUP
         *
         * We construct the data payload for the SegmentRenderer using our manually calculated bounds.
         * - `points`: The `segmentStart` and `segmentEnd` calculated above (clamped to screen edges).
         * - `line`: The visual styling options.
         * - `toolDefault...`: Cursor styles for hit testing.
         */
        this._lineRenderer.setData({
            // Pass the dynamically calculated segment start and end points
            points: [segmentStart, segmentEnd],
            line: lineOptions,
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        });
        this._renderer.append(this._lineRenderer);
        // --- 5. Text Rendering: Bespoke Pivot Calculation ---
        /**
         * TEXT RENDERING & ALIGNMENT
         *
         * Horizontal Lines have special text alignment needs. "Left" alignment usually means
         * "Left side of the screen", not "Left side of the anchor".
         *
         * We calculate a dynamic `textPivotX` based on the visible segment bounds (`minXBound`, `maxXBound`)
         * calculated earlier. This ensures that if the user aligns text "Right", it sticks to the
         * right edge of the chart even as the chart scrolls.
         */
        if (options.text.value) {
            const paneDrawingWidth = this._tool.getChartDrawingWidth(); // Get the true width (W_pane)
            const horizontalAlignment = (options.text.box?.alignment?.horizontal || '').toLowerCase();
            // PIVOT BOUNDARY LOGIC
            // The anchor's screen X is the point where the line is 'anchored'
            const anchorX = anchorPoint.x;
            // Define the X-bounds of the line segment drawn on the screen
            // This is the X-Axis boundary for text placement
            const minXBound = extendLeft ? 0 : anchorX; // Start at 0 if extended left, otherwise start at anchor
            const maxXBound = extendRight ? paneDrawingWidth : anchorX; // End at W_pane if extended right, otherwise end at anchor
            const segmentWidth = maxXBound - minXBound;
            let textPivotX;
            // Calculate the custom X-pivot based on the alignment and the segment bounds
            switch (horizontalAlignment) {
                case BoxHorizontalAlignment.Left.toLowerCase():
                    // Pivot is at the left edge of the segment
                    textPivotX = minXBound;
                    break;
                case BoxHorizontalAlignment.Right.toLowerCase():
                    // Pivot is at the right edge of the segment
                    textPivotX = maxXBound;
                    break;
                case BoxHorizontalAlignment.Center.toLowerCase():
                default:
                    // Pivot is at the center of the segment
                    textPivotX = (minXBound + segmentWidth / 2);
                    break;
            }
            // The Y-pivot is simply the anchor's Y-coordinate
            const textPivot = new AnchorPoint(textPivotX, anchorPoint.y, 0);
            /**
             * TEXT RENDERER DATA SETUP
             *
             * We construct the data payload for the TextRenderer using the dynamic pivot.
             * - `points`: We use the calculated `textPivot` point (twice) to anchor the text box.
             *   This pivot moves dynamically with the screen edges if alignment is set to Left/Right.
             * - `text`: The full text configuration options.
             * - `hitTestBackground`: Enabled to allow selecting the tool via the text label.
             */
            const textRendererData = {
                points: [textPivot, textPivot], // Pass two of the same point for the text bounding box logic
                text: options.text,
                hitTestBackground: true,
                toolDefaultHoverCursor: options.defaultHoverCursor,
                toolDefaultDragCursor: options.defaultDragCursor,
            };
            this._textRenderer.setData(textRendererData);
            this._renderer.append(this._textRenderer);
        }
        // 6. Line Anchors (Handles for P1)
        //if (this.areAnchorsVisible()) {
        this._addAnchors(this._renderer);
        //}
    }
    /**
     * Adds the single interactive anchor point.
     *
     * We use the `VerticalResize` cursor because a Horizontal Line is typically fixed in Time
     * and only moves up/down in Price.
     *
     * @param renderer - The composite renderer to append the anchor to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        if (this._points.length < 1)
            return;
        const [anchorPoint] = this._points;
        // The single anchor point (P1)
        const anchorData = {
            points: [anchorPoint],
            pointsCursorType: [PaneCursorType.VerticalResize], // Vertical resize as it only moves in Price
        };
        // Add the single LineAnchorRenderer set
        renderer.append(this.createLineAnchor(anchorData, 0));
    }
}

// /src/model/LineToolHorizontalLine.ts
/**
 * Defines the specific configuration overrides that create the behavior of a Horizontal Line.
 *
 * **Tutorial Note:**
 * A Horizontal Line differs from a Trend Line in two main ways:
 * 1. **Geometry:** It is defined by 1 point, not 2.
 * 2. **Extension:** It implicitly extends infinitely to the left and right.
 *
 * This override forces `extend: { left: true, right: true }` and ensures that the
 * Price Axis Label is always visible, as checking the exact price level is the primary use case.
 */
const HorizontalLineSpecificOverrides = {
    // The key difference: It is a full-span line by default
    line: {
        extend: { left: true, right: true },
    },
    // Set default price axis label visibility for horizontal lines
    showPriceAxisLabels: true,
    priceAxisLabelAlwaysVisible: true,
};
/**
 * Concrete implementation of the Horizontal Line drawing tool.
 *
 * **What is a Horizontal Line?**
 * It is a line defined by a single anchor point (P0). The line passes through this point's
 * Price level (Y-axis) and spans the entire width of the chart.
 *
 * **Architecture Note:**
 * Unlike 2-point tools (TrendLine, Ray) which share a common ancestor, this class inherits directly
 * from {@link BaseLineTool}. It represents a fundamental base for "1-Point Horizontal" tools,
 * which {@link LineToolHorizontalRay} then extends.
 */
class LineToolHorizontalLine extends BaseLineTool {
    // Inherit most logic from BaseLineTool
    /**
     * Initializes the Horizontal Line tool.
     *
     * **Tutorial Note on Construction:**
     * 1. **Base Defaults:** We borrow `TrendLineOptionDefaults` to get standard styling (colors, widths, text settings).
     * 2. **Overrides:** We apply `HorizontalLineSpecificOverrides` to force infinite left/right extension and enable price labels.
     * 3. **View:** We assign `LineToolHorizontalLinePaneView`. This view is smart enough to take a single point
     *    and draw a line spanning the full calculated width of the chart pane.
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
        // 1. Start with a deep copy of the base TrendLine defaults (for common options like text, box, etc.)
        //    We must use the full TrendLine defaults to get all the text/font/color options.
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Merge the HorizontalLineSpecificOverrides over the base defaults.
        merge(finalOptions, deepCopy(HorizontalLineSpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        merge(finalOptions, options);
        // 4. Call the parent (BaseLineTool) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, 'HorizontalLine', 1, // 1-point tool
        priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('HorizontalLine').
         *
         * @override
         */
        this.toolType = 'HorizontalLine';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Horizontal Line is defined by exactly **1 point**. The time component (X) of this point
         * places the anchor handle, but the line itself is drawn across all time.
         *
         * @override
         */
        this.pointsCount = 1; // Defining feature of this new base
        // 5. Set the specific PaneView for this tool.
        this._setPaneViews([new LineToolHorizontalLinePaneView(this, this._chart, this._series)]);
        console.log(`HorizontalLine Tool created with ID: ${this.id()}`);
    }
    /**
     * Performs the hit test for the Horizontal Line.
     *
     * **Architecture Note:**
     * Since the line extends infinitely, we cannot simply check if the mouse is near the anchor point.
     * We must check if the mouse is near the *visible line segment* on screen.
     *
     * The `LineToolHorizontalLinePaneView` calculates the specific start (0) and end (paneWidth)
     * pixel coordinates for the current viewport. By delegating to the View's renderer, we ensure
     * accurate hit detection across the entire width of the chart.
     *
     * @param x - X coordinate in pixels.
     * @param y - Y coordinate in pixels.
     * @returns A hit result if the mouse is over the line or the anchor.
     * @override
     */
    _internalHitTest(x, y) {
        // Guard: Ensure pane view exists (prevents post-destroy calls)
        if (!this._paneViews || this._paneViews.length === 0 || !this._paneViews[0]) {
            return null;
        }
        // Get the pane view and force composite build (calls _updateImpl if invalidated)
        const paneView = this._paneViews[0];
        paneView.renderer(); // Builds composite with line (bound-aware points), text (if present), and anchors
        // Delegate to composite hitTest (tests reverse-append order: anchors > text > line)
        const compositeRenderer = paneView.renderer();
        if (!compositeRenderer || !compositeRenderer.hitTest) {
            return null;
        }
        return compositeRenderer.hitTest(x, y);
    }
    /**
     * Updates the coordinates of the single anchor point.
     *
     * **Tutorial Note on 1-Point Logic:**
     * Even though a Horizontal Line is conceptually invariant in Time (it exists at all times),
     * the *Anchor Point* (the handle the user drags) exists at a specific Time.
     *
     * Therefore, we update **both** the `timestamp` (X) and `price` (Y). This allows the user
     * to drag the handle left and right along the line (visual preference) while moving the line
     * up and down (functional change).
     *
     * @param index - The index of the point (always 0).
     * @param point - The new logical coordinates.
     * @override
     */
    setPoint(index, point) {
        if (index === 0) {
            // For HorizontalLine, only Price (Y) is important. Time (X) is just for the anchor visualization.
            // We update both Price and Time, so the anchor visualizes the correct position.
            this._points[0] = point;
            this._triggerChartUpdate();
        }
    }
    /**
     * Explicitly defines the highest valid index for an interactive anchor point.
     *
     * Since `pointsCount` is 1, the only valid index is 0.
     *
     * @override
     * @returns `0`
     */
    maxAnchorIndex() {
        return 0; // Only one anchor point at index 0
    }
}

// /src/views/LineToolHorizontalRayPaneView.ts
/**
 * Pane View for the Horizontal Ray tool.
 *
 * **Inheritance Note:**
 * This class inherits directly from {@link LineToolHorizontalLinePaneView}.
 *
 * The rendering logic in the parent view is generic enough to handle both full lines and rays.
 * It checks the `options.line.extend` property (which the Horizontal Ray model sets to `{ left: false, right: true }`)
 * and calculates the start/end points of the segment accordingly. Therefore, no custom drawing logic is needed here.
 */
class LineToolHorizontalRayPaneView extends LineToolHorizontalLinePaneView {
    /**
     * Initializes the Horizontal Ray View.
     *
     * @param source - The specific Horizontal Ray model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, // Use the specific model class for strong typing
    chart, series) {
        // Call the parent constructor (LineToolHorizontalLinePaneView)
        // The parent is designed to handle the core BaseLineTool<HorzScaleItem> type.
        super(source, chart, series);
    }
}

// /src/model/LineToolHorizontalRay.ts
/**
 * Defines the specific configuration overrides that differentiate a Horizontal Ray from a standard Horizontal Line.
 *
 * **Tutorial Note:**
 * While a Horizontal Line extends infinitely in *both* directions, a Horizontal Ray starts at the
 * anchor point and extends infinitely only to the **Right**.
 *
 * This override:
 * 1. Sets `extend: { left: false, right: true }`.
 * 2. Maintains the visibility of Price Axis labels (critical for horizontal levels).
 * 3. Hides Time Axis labels, as a horizontal line has no specific "time" other than its start anchor.
 */
const HorizontalRaySpecificOverrides = {
    line: {
        extend: { left: false, right: true }, // Key change: Extends only to the right
    },
    // Ensure the base tool's price and time axis label visibility is maintained
    showPriceAxisLabels: true,
    priceAxisLabelAlwaysVisible: false,
    showTimeAxisLabels: true, // Time axis label is redundant for horizontal lines/rays
};
/**
 * Concrete implementation of the Horizontal Ray drawing tool.
 *
 * **Inheritance Hierarchy:**
 * `BaseLineTool` -> `LineToolHorizontalLine` -> `LineToolHorizontalRay`
 *
 * **Why this inheritance?**
 * This tool shares 99% of its DNA with the {@link LineToolHorizontalLine}. It has 1 point,
 * moves the same way (Y-axis logic), and uses similar hit-testing. The only difference
 * is the visual rendering (one-sided extension). By inheriting from `LineToolHorizontalLine`,
 * we reuse all that logic and only override the specific options and View class.
 */
class LineToolHorizontalRay extends LineToolHorizontalLine {
    /**
     * Initializes the Horizontal Ray tool.
     *
     * **Tutorial Note on Option Merging:**
     * 1. **Base:** Starts with `TrendLineOptionDefaults` (for font/color structure).
     * 2. **Override:** Merges `HorizontalRaySpecificOverrides` to set `extend.right = true` and `extend.left = false`.
     * 3. **User:** Merges user `options`.
     *
     * **View Construction:**
     * It specifically instantiates `LineToolHorizontalRayPaneView`. Even though the logic is similar
     * to the Horizontal Line view, using a distinct view class allows for cleaner separation if
     * Ray-specific rendering logic is added in the future.
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
        // 1. Start with a deep copy of the base TrendLine defaults (for common options structure)
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Merge the Horizontal Ray specific overrides (line extension is the key).
        merge(finalOptions, deepCopy(HorizontalRaySpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        merge(finalOptions, options);
        // 4. Call the parent (LineToolHorizontalLine) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('HorizontalRay').
         *
         * @override
         */
        this.toolType = 'HorizontalRay';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * Like the Horizontal Line, the Ray is defined by exactly **1 point** (the start of the ray).
         *
         * @override
         */
        this.pointsCount = 1; // It is a single-point tool
        // 5. Override the pane view with the specific Ray view.
        this._setPaneViews([new LineToolHorizontalRayPaneView(this, this._chart, this._series)]);
        console.log(`HorizontalRay Tool created with ID: ${this.id()}`);
    }
}

// /src/views/LineToolVerticalLinePaneView.ts
/**
 * Pane View for the Vertical Line tool.
 *
 * **Tutorial Note on Logic:**
 * This view handles the unique requirement of drawing a line that is fixed in Time (X-axis)
 * but infinite in Price (Y-axis).
 *
 * Instead of relying on the renderer's extension logic, this view explicitly calculates
 * the top (Y=0) and bottom (Y=PaneHeight) coordinates of the current viewport and draws
 * a segment between them. This ensures accurate hit-testing and rendering across the full height.
 */
class LineToolVerticalLinePaneView extends LineToolPaneView {
    /**
     * Initializes the Vertical Line View.
     *
     * @param source - The specific Vertical Line model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        super(source, chart, series);
        /**
         * Internal renderer for the main vertical line segment.
         * @protected
         */
        this._lineRenderer = new SegmentRenderer();
        /**
         * Internal renderer for the optional text label.
         * @protected
         */
        this._textRenderer = new TextRenderer();
    }
    /**
     * The core update logic.
     *
     * It translates the single logical anchor point into a vertical segment spanning the full height
     * of the chart pane. It also handles the complex logic of rotating text 90 degrees and
     * re-mapping alignment settings (e.g., "Left" alignment becomes "Bottom" on a vertical line).
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const options = this._tool.options();
        if (!options.visible) {
            return;
        }
        const points = this._tool.points();
        if (points.length < 1) {
            return;
        }
        // --- GET VALIDATED CHART DRAWING HEIGHT ---
        // Use the validated method to get the definitive height of the drawing pane of the chart area only.
        const paneDrawingHeight = this._tool.getChartDrawingHeight();
        //const paneDrawingWidth = this._tool.getChartDrawingWidth();
        // --- CULLING IMPLEMENTATION START ---
        // We use the single point check, as the tool is conceptually an infinite line.
        /**
         * CULLING CONFIGURATION
         *
         * We treat this as a single point that extends infinitely in the vertical direction.
         * We pass `{ horizontal: false, vertical: true }` to the culler.
         * This tells the engine: "Only hide this tool if the X-coordinate (Time) is off-screen."
         * The Y-coordinate (Price) is ignored for culling because the line spans all prices.
         */
        const cullingState = getToolCullingState(points, this._tool, options.line.extend, { horizontal: false, vertical: true });
        if (cullingState !== OffScreenState.Visible) {
            //console.log('vertical line culled')
            return; // Exit if culled
        }
        // --- CULLING IMPLEMENTATION END ---
        // 1. Convert the single logical point (P1) to a screen anchor.
        // We can use the base implementation to get the screen coordinate of P1.
        const hasScreenPoints = this._updatePoints();
        if (!hasScreenPoints) {
            return;
        }
        const [anchorPoint] = this._points; // Screen coordinates of the single anchor
        // 2. Manufacture two screen points for the vertical segment (P_Top and P_Bottom).
        const lineX = anchorPoint.x; // The X-coordinate is the same for both
        /**
         * SEGMENT CALCULATION
         *
         * We manually construct the vertical segment.
         * - `pTop`: X = anchor, Y = 0 (Top of pane).
         * - `pBottom`: X = anchor, Y = paneHeight (Bottom of pane).
         *
         * This creates a finite segment that covers the exact visible area.
         */
        const pTop = new AnchorPoint(lineX, 0, 0); // P_Top (Y=0)
        const pBottom = new AnchorPoint(lineX, paneDrawingHeight, 0); // P_Bottom (Y=paneHeight)
        // The core segment being drawn is between P_Top and P_Bottom.
        const segmentPoints = [pTop, pBottom];
        // --- Setup Renderers ---
        const compositeRenderer = new CompositeRenderer();
        // 1. Segment Renderer (The Vertical Line itself)
        const lineOptions = deepCopy(options.line);
        lineOptions.join = lineOptions.join || LineJoin.Miter;
        lineOptions.cap = lineOptions.cap || LineCap.Butt;
        // The Vertical Line does not use extension logic in the SegmentRenderer call,
        // as it is already drawn full-pane-height via P_Top and P_Bottom.
        //lineOptions.extend = { left: false, right: false }; 
        /**
         * LINE RENDERER DATA SETUP
         *
         * We configure the `SegmentRenderer` with our manually created vertical segment.
         * Explicitly defining the start/end points ensures hit-testing works perfectly
         * from the very top to the very bottom of the chart.
         */
        this._lineRenderer.setData({
            points: segmentPoints,
            line: lineOptions,
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        });
        compositeRenderer.append(this._lineRenderer);
        // 2. Text Renderer (If applicable - typically not used for a simple vertical line)
        if (options.text.value) {
            // --- Conditional Vertical Rotation ---
            // V3.8 behavior: The tool's natural orientation is vertical (90 degrees).
            // We add 90 degrees to the user's defined angle (which is 0 by default).
            // This makes the user's 'angle' setting relative to the vertical axis.
            const userAngle = options.text.box?.angle || 0;
            const textOptions = deepCopy(options.text);
            textOptions.box = { ...textOptions.box, angle: userAngle + 90 };
            // --- End Conditional Rotation ---
            // 1. Measure the text box size (Must use the rotated options)
            // Temporarily set data to measure the box's dimensions
            const tempTextRendererData = {
                points: [], // Points not needed for measure
                text: textOptions,
            };
            this._textRenderer.setData(tempTextRendererData);
            const boxDimensions = this._textRenderer.measure(); // { width: unscaled, height: unscaled }
            //console.log('boxDimensions', boxDimensions)
            // --- Text Attachment Point (Pivot) Calculation ---
            /**
             * TEXT ROTATION & ALIGNMENT LOGIC
             *
             * Vertical lines have standard text rotated 90 degrees.
             * 1. **Rotation:** We add 90 degrees to the user's angle setting.
             * 2. **Alignment Mapping:** Standard "Left/Right" alignment doesn't make sense vertically.
             *    - "Right" (Forward in time) maps to the **Top** of the screen (Y=0).
             *    - "Left" (Backward in time) maps to the **Bottom** of the screen (Y=Height).
             *    - We also apply offsets based on the measured text width (which becomes height after rotation)
             *      to ensure the text doesn't get cut off at the edges.
             */
            const textAlignment = options.text.alignment.toLowerCase();
            let textPivotY;
            // We need the measured text box's vertical span for alignment compensation.
            // For vertical alignment (Top/Bottom/Middle), the compensation for text being 
            // cut off at the vertical extremes is based on the box's vertical span.
            // since the text is intially calculated horizontally, and the vertical tool is artificially rotating it, we need
            // to use boxDimensions.width for the rotated boxes heght from the bottom of the screen to the top of the screen.
            const textVerticalSpan = boxDimensions.width;
            const halfVerticalSpan = textVerticalSpan / 2;
            // Check Horizontal Alignment to determine the Y-pivot position along the vertical line
            // This maps the user's X-axis alignment intention (Left/Right) to the vertical Y-axis extremes.
            switch (textAlignment) {
                case BoxHorizontalAlignment.Right.toLowerCase():
                    // Right (latest/highest) -> Top of screen (Y=0)
                    // Shift the center DOWN by half the box's vertical span to prevent cut-off.
                    textPivotY = (0 + halfVerticalSpan);
                    break;
                case BoxHorizontalAlignment.Left.toLowerCase():
                    // Left (earliest/lowest) -> Bottom of screen (Y=paneDrawingHeight)
                    // Shift the center UP by half the box's vertical span to prevent cut-off.
                    textPivotY = (paneDrawingHeight - halfVerticalSpan);
                    break;
                case BoxHorizontalAlignment.Center.toLowerCase():
                default:
                    // Center -> Center Y-value (for vertical line)
                    textPivotY = (paneDrawingHeight / 2);
                    break;
            }
            // Text Attachment Point (X is the line's position, Y is the calculated pivot)
            const textAttachmentPoint = new AnchorPoint(lineX, textPivotY, 0);
            // 2. Final Data Setup and Render
            /**
             * TEXT RENDERER DATA SETUP
             *
             * - `points`: We use the calculated `textAttachmentPoint` which places the text
             *   at the correct vertical position along the line.
             * - `text`: Contains the rotated options.
             */
            const textRendererData = {
                points: [textAttachmentPoint], // Text anchor is the single point
                text: textOptions,
                hitTestBackground: true,
                toolDefaultHoverCursor: options.defaultHoverCursor,
                toolDefaultDragCursor: options.defaultDragCursor,
            };
            this._textRenderer.setData(textRendererData);
            compositeRenderer.append(this._textRenderer);
        }
        // 3. Line Anchors (Handles for P1)
        //if (this.areAnchorsVisible()) {
        this._addAnchors(compositeRenderer);
        //}
        this._renderer = compositeRenderer;
    }
    /**
     * Adds the single interactive anchor point.
     *
     * We use the `HorizontalResize` cursor because a Vertical Line is fixed in Price (conceptually)
     * and only moves Left/Right in Time.
     *
     * @param renderer - The composite renderer to append the anchor to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        if (this._points.length < 1)
            return;
        const [anchorPoint] = this._points;
        // The single anchor point (P1) should suggest horizontal movement only
        const anchorData = {
            points: [anchorPoint],
            pointsCursorType: [PaneCursorType.HorizontalResize], // Suggest horizontal resize (ew-resize)
        };
        // Add the single LineAnchorRenderer set
        renderer.append(this.createLineAnchor(anchorData, 0));
    }
}

// /src/model/LineToolVerticalLine.ts
/**
 * Defines the specific configuration overrides that create the behavior of a Vertical Line.
 *
 * **Tutorial Note:**
 * A Vertical Line is the inverse of a Horizontal Line.
 * 1. **Extensions:** It conceptually extends infinitely up and down (`extend: { left: true, right: true }` applied to the vertical axis logic).
 * 2. **Axis Labels:**
 *    - **Price Label:** Irrelevant (it covers all prices), so we hide it (`showPriceAxisLabels: false`).
 *    - **Time Label:** Critical (it marks a specific time), so we ensure it is visible (`showTimeAxisLabels: true`).
 */
const VerticalLineSpecificOverrides = {
    // Line options fixed to draw a full-height vertical line segment
    line: {
        extend: { left: true, right: true }, // No extension on this segment (full height is handled by view)
    },
    // Price Axis Label is irrelevant and should be hidden
    showPriceAxisLabels: false,
    priceAxisLabelAlwaysVisible: false,
    // Time Axis Label is the primary identification for this tool
    showTimeAxisLabels: true,
    timeAxisLabelAlwaysVisible: true,
};
/**
 * Concrete implementation of the Vertical Line drawing tool.
 *
 * **What is a Vertical Line?**
 * It is a line defined by a single anchor point (P0). The line is fixed at this point's
 * Time (X-axis) and spans the entire height of the chart pane.
 *
 * **Inheritance:**
 * Like the Horizontal Line, this tool inherits directly from {@link BaseLineTool} because it
 * represents a fundamental 1-point geometric primitive that doesn't share the 2-point logic
 * of the Trend Line family.
 */
class LineToolVerticalLine extends BaseLineTool {
    /**
     * Initializes the Vertical Line tool.
     *
     * **Tutorial Note on Construction:**
     * 1. **Base Defaults:** We use `TrendLineOptionDefaults` to establish common styling (color, width).
     * 2. **Overrides:** We apply `VerticalLineSpecificOverrides` to configure the axis labels correctly.
     * 3. **View:** We assign `LineToolVerticalLinePaneView`. This view is responsible for taking the
     *    single point and manufacturing a vertical segment that spans from Y=0 to Y=PaneHeight.
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
        // 1. Start with a deep copy of the base TrendLine defaults (for common options structure)
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Merge the VerticalLineSpecificOverrides over the base defaults.
        merge(finalOptions, deepCopy(VerticalLineSpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        merge(finalOptions, options);
        // 4. Call the parent (BaseLineTool) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, 'VerticalLine', 1, // 1-point tool
        priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('VerticalLine').
         *
         * @override
         */
        this.toolType = 'VerticalLine';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Vertical Line is defined by exactly **1 point** (the position on the time scale).
         *
         * @override
         */
        this.pointsCount = 1; // Defining feature: 1 point
        // 5. Set the specific PaneView for this tool.
        this._setPaneViews([new LineToolVerticalLinePaneView(this, this._chart, this._series)]);
        console.log(`VerticalLine Tool created with ID: ${this.id()}`);
    }
    /**
     * Performs the hit test for the Vertical Line.
     *
     * **Architecture Note:**
     * Because the line extends infinitely vertically, a simple point-to-point distance check on the
     * Model's anchor point is insufficient (the user might click at the very top of the screen while
     * the anchor is in the middle).
     *
     * We delegate this to the `LineToolVerticalLinePaneView`, which knows the exact pixel height
     * of the pane and draws the full vertical segment used for hit detection.
     *
     * @param x - X coordinate in pixels.
     * @param y - Y coordinate in pixels.
     * @returns A hit result if the mouse is over the vertical line or the anchor.
     * @override
     */
    _internalHitTest(x, y) {
        // Guard: Ensure pane view exists (prevents post-destroy calls)
        if (!this._paneViews || this._paneViews.length === 0 || !this._paneViews[0]) {
            return null;
        }
        // 1. Get the primary Pane View
        const paneView = this._paneViews[0];
        // 2. Get the Composite Renderer (calling renderer() also ensures it's updated)
        const compositeRenderer = paneView.renderer();
        // 3. Delegate the hit test
        if (!compositeRenderer || !compositeRenderer.hitTest) {
            return null;
        }
        return compositeRenderer.hitTest(x, y);
    }
    /**
     * Updates the coordinates of the single anchor point.
     *
     * **Tutorial Note on Constraints:**
     * A Vertical Line is strictly bound to the **Time Axis**.
     * When the user drags the tool, we update the `timestamp` (X).
     *
     * While the `price` (Y) component technically doesn't affect the *line's* position,
     * we still update it so the anchor handle follows the user's mouse vertically,
     * providing better visual feedback during the drag.
     *
     * @param index - The index of the point (always 0).
     * @param point - The new logical coordinates.
     * @override
     */
    setPoint(index, point) {
        if (index === 0) {
            // VerticalLine is fixed on the Time (X) axis.
            // Only update the timestamp component; ignore the price component (Y).
            this._points[0].timestamp = point.timestamp;
            // Optional: Allow P0's price to be updated for anchor hit-testing/visualization, but it has no impact on the line itself.
            this._points[0].price = point.price;
            this._triggerChartUpdate();
        }
    }
    /**
     * Explicitly defines the highest valid index for an interactive anchor point.
     *
     * Since `pointsCount` is 1, the only valid index is 0.
     *
     * @override
     * @returns `0`
     */
    maxAnchorIndex() {
        return 0;
    }
}

// /src/views/LineToolCrossLinePaneView.ts
/**
 * Pane View for the Cross Line tool.
 *
 * **Tutorial Note on Logic:**
 * The Cross Line is unique because it takes a **Single Point** from the model but renders
 * **Two Infinite Lines** (Horizontal and Vertical).
 *
 * Since the rendering engine draws finite segments, this view is responsible for:
 * 1. Determining the full width and height of the chart pane.
 * 2. Creating a vertical segment from top to bottom at the point's X.
 * 3. Creating a horizontal segment from left to right at the point's Y.
 */
class LineToolCrossLinePaneView extends LineToolPaneView {
    /**
     * Initializes the Cross Line View.
     *
     * @param source - The specific Cross Line model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        super(source, chart, series);
        // Need two separate renderers for the two distinct segments
        this._horizontalRenderer = new SegmentRenderer();
        this._verticalRenderer = new SegmentRenderer();
    }
    /**
     * The core update logic.
     *
     * It translates the single logical anchor point into two full-screen segments
     * (Horizontal and Vertical) and configures separate renderers for each.
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const options = this._tool.options();
        if (!options.visible) {
            return;
        }
        const points = this._tool.points();
        if (points.length < 1) {
            return;
        }
        // --- CULLING IMPLEMENTATION START ---
        // A CrossLine is visible if the single anchor point is on screen.
        /**
         * 1. CULLING & VISIBILITY CHECK
         *
         * A Cross Line is infinite in both directions.
         * We pass `{ horizontal: true, vertical: true }` to the culler.
         * This tells the culling engine: "Only hide this tool if the anchor is
         * completely off-screen in BOTH X and Y dimensions."
         * (e.g., if the point is to the left AND above the viewport).
         */
        const cullingState = getToolCullingState(points, this._tool, options.line.extend, { horizontal: true, vertical: true } // Dual infinite component
        );
        // Note: A CrossLine is technically visible if the point's X is on screen OR Y is on screen,
        // but since it's infinite in both directions, it's only culled if the point's X is outside
        // the X-range AND the Y is outside the Y-range (i.e., fully off-screen X and Y).
        if (cullingState !== OffScreenState.Visible) {
            //console.log('cross line tool culled')
            return; // Exit if culled
        }
        // --- CULLING IMPLEMENTATION END ---
        /**
         * 2. COORDINATE CONVERSION & DIMENSIONS
         *
         * We convert the single anchor to screen coordinates.
         * We also retrieve the exact drawing dimensions of the pane. This is crucial
         * for defining the start/end points of our "infinite" lines.
         */
        const hasScreenPoints = this._updatePoints();
        if (!hasScreenPoints) {
            return;
        }
        const [anchorPoint] = this._points; // Screen coordinates of the single anchor
        const lineX = anchorPoint.x;
        const lineY = anchorPoint.y;
        // --- Setup Renderers ---
        const compositeRenderer = new CompositeRenderer();
        // We need to use the explicit drawing width/height from the tool's core method
        const paneDrawingHeight = this._tool.getChartDrawingHeight();
        const paneDrawingWidth = this._tool.getChartDrawingWidth();
        // Use the line options, but must ensure X-extension is false for the segment renderer
        const lineOptions = deepCopy(options.line);
        lineOptions.join = lineOptions.join || LineJoin.Miter;
        lineOptions.cap = lineOptions.cap || LineCap.Butt;
        lineOptions.extend = { left: false, right: false };
        /**
         * 3. RENDERER MANUFACTURE
         *
         * We manually create two distinct segments:
         * A. **Vertical Segment:** Fixed X, spanning from Y=0 to Y=Height.
         * B. **Horizontal Segment:** Fixed Y, spanning from X=0 to X=Width.
         *
         * We use separate renderers (`_verticalRenderer`, `_horizontalRenderer`) to
         * ensure they can be hit-tested independently if needed.
         */
        const commonSegmentOptions = lineOptions;
        const commonCursorOptions = {
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        };
        // 1. Vertical Segment (Full Height)
        const pTop = new AnchorPoint(lineX, 0, 0);
        const pBottom = new AnchorPoint(lineX, paneDrawingHeight, 0);
        /**
         * Internal renderer for the infinite vertical segment of the crosshair.
         * @protected
         */
        this._verticalRenderer.setData({
            points: [pTop, pBottom],
            line: commonSegmentOptions,
            ...commonCursorOptions,
        });
        compositeRenderer.append(this._verticalRenderer);
        // 2. Horizontal Segment (Full Width)
        const pLeft = new AnchorPoint(0, lineY, 0);
        const pRight = new AnchorPoint(paneDrawingWidth, lineY, 0);
        /**
         * Internal renderer for the infinite horizontal segment of the crosshair.
         * @protected
         */
        this._horizontalRenderer.setData({
            points: [pLeft, pRight],
            line: commonSegmentOptions,
            ...commonCursorOptions,
        });
        compositeRenderer.append(this._horizontalRenderer);
        // 3. Line Anchors (Handles for P1)
        //if (this.areAnchorsVisible()) {
        this._addAnchors(compositeRenderer);
        //}
        this._renderer = compositeRenderer;
    }
    /**
     * Adds the single interactive anchor point at the intersection.
     *
     * We use the `Crosshair` cursor to indicate that this point moves freely in 2D space.
     *
     * @param renderer - The composite renderer to append the anchor to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        if (this._points.length < 1)
            return;
        const [anchorPoint] = this._points;
        // The single anchor point (P1) should suggest crosshair/move cursor
        const anchorData = {
            points: [anchorPoint],
            pointsCursorType: [PaneCursorType.Crosshair], // Suggest crosshair/move
        };
        // Add the single LineAnchorRenderer set
        renderer.append(this.createLineAnchor(anchorData, 0));
    }
}

// /src/model/LineToolCrossLine.ts
/**
 * Defines the default configuration for the Cross Line tool.
 *
 * **Tutorial Note:**
 * A Cross Line is visually distinct because it spans the entire chart in both directions.
 * These defaults set the baseline visibility and styling (e.g., solid blue lines).
 * While the `extend` property is set to true here, the actual infinite rendering logic
 * is heavily handled by the `LineToolCrossLinePaneView`, which manufactures two distinct
 * infinite segments intersecting at the anchor point.
 */
const CrossLineDefaultOptions = {
    visible: true,
    editable: true,
    defaultHoverCursor: PaneCursorType.Crosshair,
    defaultDragCursor: PaneCursorType.Crosshair,
    defaultAnchorHoverCursor: PaneCursorType.Crosshair,
    defaultAnchorDragCursor: PaneCursorType.Crosshair,
    notEditableCursor: PaneCursorType.Crosshair,
    showPriceAxisLabels: true,
    showTimeAxisLabels: true,
    priceAxisLabelAlwaysVisible: true,
    timeAxisLabelAlwaysVisible: true,
    // Specific Line Options (Inherited from the simplified V3.8 CrossLine options)
    line: {
        width: 1,
        color: '#2962ff', // Default blue
        style: LineStyle.Solid,
        // We keep extend/end properties to give flexibility, but the view will handle the infinite span
        extend: { left: true, right: true }, // The view will interpret this as full infinite span
        end: { left: LineEnd.Normal, right: LineEnd.Normal },
    },
};
/**
 * Concrete implementation of the Cross Line drawing tool.
 *
 * **What is a Cross Line?**
 * Unlike a Trend Line (2 points) or a Ray (2 points), a Cross Line is defined by a
 * **single point** (P0). This point represents the intersection where a vertical line
 * and a horizontal line meet.
 *
 * **Inheritance Note:**
 * Because this is a 1-point tool, it extends the abstract {@link BaseLineTool} directly
 * rather than inheriting from `LineToolTrendLine`. It implements its own simple
 * logic for point updates and hit testing.
 */
class LineToolCrossLine extends BaseLineTool {
    /**
     * Initializes the Cross Line tool.
     *
     * **Tutorial Note:**
     * 1. It merges `CrossLineDefaultOptions` with user options.
     * 2. It sets `pointsCount` to 1 in the `super()` call.
     * 3. It assigns the specialized `LineToolCrossLinePaneView`, which is responsible
     *    for taking that single point and drawing the two intersecting infinite lines.
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
        // 1. Start with a deep copy of the base defaults.
        const finalOptions = deepCopy(CrossLineDefaultOptions);
        // 2. Merge the user's provided options last (User wins).
        merge(finalOptions, options);
        // 3. Call the parent (BaseLineTool) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, 'CrossLine', 1, // 1-point tool
        priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('CrossLine').
         *
         * @override
         */
        this.toolType = 'CrossLine';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Cross Line is defined by exactly **1 point** (the center of the cross).
         *
         * @override
         */
        this.pointsCount = 1; // Defining feature: 1 point
        // 4. Set the specific PaneView for this tool.
        this._setPaneViews([new LineToolCrossLinePaneView(this, this._chart, this._series)]);
        console.log(`CrossLine Tool created with ID: ${this.id()}`);
    }
    /**
     * Performs the hit test for the Cross Line.
     *
     * **Architecture Note:**
     * Even though the Model only holds one point, the View renders lines spanning the whole screen.
     * Therefore, we cannot do simple math here. We **must** delegate to the View's `CompositeRenderer`.
     * The View knows exactly where those infinite lines are drawn on the pixel canvas, ensuring
     * that clicking anywhere on the crosshair lines registers as a hit.
     *
     * @param x - X coordinate in pixels.
     * @param y - Y coordinate in pixels.
     * @returns A hit result if the mouse is over the horizontal or vertical line, or the center anchor.
     * @override
     */
    _internalHitTest(x, y) {
        // Guard: Ensure pane view exists
        if (!this._paneViews || this._paneViews.length === 0 || !this._paneViews[0]) {
            return null;
        }
        // 1. Get the primary Pane View
        const paneView = this._paneViews[0];
        paneView.renderer();
        // 2. Get the Composite Renderer 
        const compositeRenderer = paneView.renderer();
        // 3. Delegate the hit test
        if (!compositeRenderer || !compositeRenderer.hitTest) {
            return null;
        }
        return compositeRenderer.hitTest(x, y);
    }
    /**
     * Updates the coordinates of the single anchor point (Intersection).
     *
     * **Tutorial Note on Constraints:**
     * Unlike a `VerticalLine` (which locks Time) or `HorizontalLine` (which locks Price),
     * a Cross Line moves freely in both dimensions. Therefore, this method updates
     * both the `timestamp` (X) and `price` (Y) of point 0 whenever the user drags it.
     *
     * @param index - The index of the point (always 0).
     * @param point - The new logical coordinates.
     * @override
     */
    setPoint(index, point) {
        if (index === 0) {
            // Update both Price and Time freely.
            this._points[0].timestamp = point.timestamp;
            this._points[0].price = point.price;
            this._triggerChartUpdate();
        }
    }
    /**
     * Explicitly defines the highest valid index for an interactive anchor point.
     *
     * Since `pointsCount` is 1, the only valid index is 0.
     *
     * @override
     * @returns `0`
     */
    maxAnchorIndex() {
        return 0;
    }
}

// /src/views/LineToolCalloutPaneView.ts
/**
 * Pane View for the Callout tool.
 *
 * **Tutorial Note on View Logic:**
 * The Callout requires a custom view because its rendering pipeline differs from a simple line.
 * It involves two distinct visual elements:
 * 1. A **Text Box** (the annotation).
 * 2. A **Stem Line** (connecting the target point P0 to the text box P1).
 *
 * This view manages the coordination of these two renderers.
 */
class LineToolCalloutPaneView extends LineToolPaneView {
    /**
     * Initializes the Callout View.
     *
     * @param source - The specific Callout model instance.
     * @param chart - The Chart API.
     * @param series - The Series API.
     */
    constructor(source, chart, series) {
        super(source, chart, series);
        this._segmentRenderer = new SegmentRenderer();
        this._textRenderer = new TextRenderer();
    }
    /**
     * Orchestrates the rendering of the line stem and the text box.
     *
     * @param height - The height of the pane.
     * @param width - The width of the pane.
     * @protected
     * @override
     */
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        const options = this._tool.options();
        if (!options.visible) {
            return;
        }
        if (this._tool.points().length < 2) {
            return;
        }
        // 1. CULLING: Callout is a segment, so we rely on the core geometric culling.
        const points = this._tool.points();
        /**
         * 1. CULLING & VISIBILITY CHECK
         *
         * Even though the Callout is complex, we treat the Stem (segment P0-P1) as the
         * primary object for culling. We use the core geometric culler to check visibility.
         */
        const cullingState = getToolCullingState(points, this._tool, options.line.extend);
        if (cullingState !== OffScreenState.Visible) {
            //console.log('callout culled')
            return; // Exit if culled
        }
        // 2. Coordinate Conversion
        const hasScreenPoints = this._updatePoints(); // Converts logical points to screen coordinates (_points array)
        if (!hasScreenPoints) {
            return;
        }
        const [point0, point1] = this._points; // Screen coordinates P0 (Stem Start) and P1 (Text Box Anchor)
        // Text Renderer logic needs the text pivot, which is P1 in screen space
        const textPivot = point1;
        const textOptions = deepCopy(options.text);
        /**
         * 2. TEXT RENDERER SETUP (MEASUREMENT)
         *
         * We calculate the text box data first. P1 serves as the "Pivot" or anchor for the text box.
         * We configure the `TextRendererData` with P1 and the text options.
         *
         * `measure()` can be called here if we need to know the box dimensions to adjust the stem
         * endpoint (e.g., to stop at the box border instead of the center), though in this
         * simplified implementation, the stem runs directly to the pivot P1.
         */
        const textRendererData = {
            points: [textPivot],
            text: textOptions,
            hitTestBackground: true,
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        };
        // Temporarily set data to the TextRenderer to measure the final bounding box size.
        // NOTE: This must happen *before* we calculate the final line end point.
        this._textRenderer.setData(textRendererData);
        this._textRenderer.measure(); // { width: boxWidth, height: boxHeight }
        /**
         * 3. SEGMENT RENDERER SETUP (THE STEM)
         *
         * We configure the `SegmentRenderer` to draw the line connecting the Target (P0)
         * to the Text Box (P1).
         */
        const lineOptions = deepCopy(options.line);
        lineOptions.join = lineOptions.join || LineJoin.Miter;
        lineOptions.cap = lineOptions.cap || LineCap.Butt;
        this._segmentRenderer.setData({
            points: [point0, point1], // P0 to P1
            line: lineOptions,
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        });
        // --- 4. Final Assembly ---
        this._renderer.clear();
        const compositeRenderer = new CompositeRenderer();
        // Render the Line Stem first
        compositeRenderer.append(this._segmentRenderer);
        // Render the Text Box second
        compositeRenderer.append(this._textRenderer);
        // Render Anchors last for hit-test priority
        if (this.areAnchorsVisible()) {
            this._addAnchors(compositeRenderer);
        }
        this._renderer = compositeRenderer;
    }
    /**
     * Adds the two interactive anchor points.
     *
     * - **P0:** The "Target" point (where the callout points to).
     * - **P1:** The "Text" point (where the annotation sits).
     *
     * @param renderer - The composite renderer to append anchors to.
     * @protected
     * @override
     */
    _addAnchors(renderer) {
        if (this._points.length < 2)
            return;
        const [point0, point1] = this._points;
        // The two anchor points (P0 and P1)
        const anchorData = {
            points: [point0, point1],
            pointsCursorType: [PaneCursorType.Pointer, PaneCursorType.Pointer],
        };
        renderer.append(this.createLineAnchor(anchorData, 0));
    }
}

// /src/model/LineToolCallout.ts
/**
 * Defines the specific configuration overrides that shape a Trend Line into a Callout tool.
 *
 * **Tutorial Note:**
 * A Callout is distinct from a simple line because it emphasizes text over geometry.
 * These overrides:
 * 1. **Disable Axis Labels:** Callouts are usually for annotation, not price measurement.
 * 2. **Set Cursors:** Configures distinct pointers for hovering/dragging.
 * 3. **Configure Text Defaults:** Sets up a visible background box, border, and specific padding/alignment
 *    to ensure the text is readable and "pop-out" style by default.
 * 4. **Disable Extensions:** Ensures the line is strictly a segment between the pointer and text.
 */
const CalloutSpecificOverrides = {
    defaultHoverCursor: PaneCursorType.Pointer,
    defaultDragCursor: PaneCursorType.Grabbing,
    defaultAnchorHoverCursor: PaneCursorType.Pointer,
    defaultAnchorDragCursor: PaneCursorType.Grabbing,
    notEditableCursor: PaneCursorType.NotAllowed,
    showPriceAxisLabels: false,
    showTimeAxisLabels: false,
    priceAxisLabelAlwaysVisible: false,
    timeAxisLabelAlwaysVisible: false,
    line: {
        end: { left: LineEnd.Normal, right: LineEnd.Normal }, // Default to Normal ends
        extend: { left: false, right: false }, // Callout is always a segment (the stem)
    },
    text: {
        value: 'this is some text',
        padding: 0,
        wordWrapWidth: 150,
        font: {
            color: 'rgba(255,255,255,1)',
            size: 14,
            bold: false,
            italic: false,
        },
        // Default to a visible text box background for clarity/design
        box: {
            shadow: {
                blur: 0,
                color: 'rgba(255,255,255,1)',
                offset: {
                    x: 0,
                    y: 0,
                },
            },
            border: {
                color: 'rgba(74,144,226,1)',
                width: 1,
                radius: 20,
                highlight: false,
                style: 0,
            },
            background: {
                color: 'rgba(19,73,133,1)',
                inflation: {
                    x: 10,
                    y: 10,
                },
            },
            padding: { x: 5, y: 5 },
            alignment: { vertical: 'middle', horizontal: 'center' },
            maxHeight: 500,
        }
    }
};
/**
 * Concrete implementation of the Callout drawing tool.
 *
 * **What is a Callout?**
 * A Callout connects a specific point of interest on the chart (P0, the "Pointer")
 * to a text label (P1, the "Anchor"). Unlike a Trend Line, the relationship between
 * these points is directional and semantic, not just geometric.
 *
 * **Inheritance:**
 * It extends {@link LineToolTrendLine} to inherit the underlying 2-point data structure and
 * generic text capability, but uses a specialized View (`LineToolCalloutPaneView`) to render
 * the specific "Stem + Text Box" visual style.
 */
class LineToolCallout extends LineToolTrendLine {
    /**
     * Initializes the Callout tool.
     *
     * **Tutorial Note on Construction:**
     * 1. We start with `TrendLineOptionDefaults` as a base.
     * 2. We apply `CalloutSpecificOverrides` to turn off axis labels and set up the text box styling.
     * 3. We apply user `options` last.
     * 4. Crucially, we assign `LineToolCalloutPaneView` instead of the standard Trend Line view.
     *    This swap is what actually makes the tool look like a Callout on the canvas.
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
        // 1. Start with a deep copy of the base TrendLine defaults.
        const finalOptions = deepCopy(TrendLineOptionDefaults);
        // 2. Deep-copy the overrides before merging them.
        merge(finalOptions, deepCopy(CalloutSpecificOverrides));
        // 3. Merge the user's provided options last (User wins).
        merge(finalOptions, options);
        // 4. Call the parent (LineToolTrendLine) constructor.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, points, priceAxisLabelStackingManager);
        /**
         * The unique identifier for this tool type ('Callout').
         *
         * @override
         */
        this.toolType = 'Callout';
        /**
         * Defines the number of anchor points required to draw this tool.
         *
         * A Callout requires exactly **2 points**:
         * 1. The target point (where the arrow/line points to).
         * 2. The text box anchor point (where the label sits).
         *
         * @override
         */
        this.pointsCount = 2; // Inherits 2-point behavior
        // 5. Set the specific PaneView for this tool.
        this._setPaneViews([new LineToolCalloutPaneView(this, this._chart, this._series)]);
        console.log(`Callout Tool created with ID: ${this.id()}`);
    }
    /**
     * Overrides the base normalization logic to **prevent** point swapping.
     *
     * **Why override this?**
     * In a standard Trend Line, the order of points doesn't matter visually, so we sort them by time
     * to simplify math. However, a Callout has strict directionality:
     * - Point 0 is *always* the Pointer (Target).
     * - Point 1 is *always* the Text Box location.
     *
     * If we allowed normalization, dragging the text box to the left of the target would swap
     * the points, causing the text box to suddenly jump to the target's position and the pointer
     * to jump to the text's position. Overriding this with an empty function preserves the
     * logical relationship between the two points.
     *
     * @override
     */
    normalize() {
        // Do nothing. Prevent the callout points from being swapped based on time.
    }
}

// /src/index.ts
// Define the name under which this specific tool will be registered
const TREND_LINE_NAME = 'TrendLine';
const EXTENDED_LINE_NAME = 'ExtendedLine';
const ARROW_LINE_NAME = 'Arrow';
const RAY_LINE_NAME = 'Ray';
const HORIZONTAL_LINE_NAME = 'HorizontalLine';
const HORIZONTAL_RAY_NAME = 'HorizontalRay';
const VERTICAL_LINE_NAME = 'VerticalLine';
const CROSS_LINE_NAME = 'CrossLine';
const CALLOUT_LINE_NAME = 'Callout';
/**
 * Registers all standard line tools (Trend Line, Ray, Arrow, Extended Line, Horizontal Line,
 * Horizontal Ray, Vertical Line, Cross Line, and Callout) with the provided Core Plugin instance.
 *
 * This is the primary entry point for enabling the standard suite of drawing tools.
 *
 * @param corePlugin - The instance of the Core Line Tools Plugin (created via `createLineToolsPlugin`).
 * @returns void
 *
 * @example
 * ```ts
 * import { createLineToolsPlugin } from 'lightweight-charts-line-tools-core';
 * import { registerLinesPlugin } from 'lightweight-charts-line-tools-lines';
 *
 * const corePlugin = createLineToolsPlugin(chart, series);
 * registerLinesPlugin(corePlugin);
 * ```
 */
function registerLinesPlugin(corePlugin) {
    // 1. Register the TrendLine Tool
    // We pass the specific name and the class constructor.
    corePlugin.registerLineTool(TREND_LINE_NAME, LineToolTrendLine);
    corePlugin.registerLineTool(EXTENDED_LINE_NAME, LineToolExtendedLine);
    corePlugin.registerLineTool(ARROW_LINE_NAME, LineToolArrow);
    corePlugin.registerLineTool(RAY_LINE_NAME, LineToolRay);
    corePlugin.registerLineTool(HORIZONTAL_LINE_NAME, LineToolHorizontalLine);
    corePlugin.registerLineTool(HORIZONTAL_RAY_NAME, LineToolHorizontalRay);
    corePlugin.registerLineTool(VERTICAL_LINE_NAME, LineToolVerticalLine);
    corePlugin.registerLineTool(CROSS_LINE_NAME, LineToolCrossLine);
    corePlugin.registerLineTool(CALLOUT_LINE_NAME, LineToolCallout);
    // For the full plugin, the other tools would be registered here:
    // corePlugin.registerLineTool('Ray', LineToolRay);
    // corePlugin.registerLineTool('ExtendedLine', LineToolExtendedLine);
    // ... etc.
    console.log(`Registered Line Tool: ${TREND_LINE_NAME}`);
    console.log(`Registered Line Tool: ${EXTENDED_LINE_NAME}`);
    console.log(`Registered Line Tool: ${ARROW_LINE_NAME}`);
    console.log(`Registered Line Tool: ${RAY_LINE_NAME}`);
    console.log(`Registered Line Tool: ${HORIZONTAL_LINE_NAME}`);
    console.log(`Registered Line Tool: ${HORIZONTAL_RAY_NAME}`);
    console.log(`Registered Line Tool: ${VERTICAL_LINE_NAME}`);
    console.log(`Registered Line Tool: ${CROSS_LINE_NAME}`);
    console.log(`Registered Line Tool: ${CALLOUT_LINE_NAME}`);
}

export { LineToolArrow, LineToolCallout, LineToolCrossLine, LineToolExtendedLine, LineToolHorizontalLine, LineToolHorizontalRay, LineToolRay, LineToolTrendLine, LineToolVerticalLine, registerLinesPlugin as default, registerLinesPlugin };
//# sourceMappingURL=lightweight-charts-line-tools-lines.js.map
