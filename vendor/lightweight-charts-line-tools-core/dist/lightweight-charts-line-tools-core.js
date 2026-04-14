import { LineStyle } from 'lightweight-charts';

// /src/utils/helpers.ts
/**
 * Internal helper to parse a CSS color string into its RGBA components.
 *
 * Supports various formats:
 * - Hex: `#RGB`, `#RRGGBB`
 * - Functional: `rgb(r, g, b)`, `rgba(r, g, b, a)`
 * - Keywords: `transparent`, `white`
 *
 * @param colorString - The input color string.
 * @returns A tuple `[r, g, b, a]` where components are integers 0-255 (alpha is 0-1).
 */
function colorStringToRgba(colorString) {
    colorString = colorString.toLowerCase();
    // Handle 'transparent' keyword
    if (colorString === 'transparent') {
        return [0, 0, 0, 0];
    }
    // Regex for rgba(r, g, b, a)
    const rgbaRe = /^rgba\(\s*(-?\d{1,10})\s*,\s*(-?\d{1,10})\s*,\s*(-?\d{1,10})\s*,\s*(-?[\d]{0,10}(?:\.\d+)?)\s*\)$/;
    let matches = rgbaRe.exec(colorString);
    if (matches) {
        return [
            parseInt(matches[1], 10),
            parseInt(matches[2], 10),
            parseInt(matches[3], 10),
            parseFloat(matches[4]),
        ];
    }
    // Regex for rgb(r, g, b) - with default alpha 1
    const rgbRe = /^rgb\(\s*(-?\d{1,10})\s*,\s*(-?\d{1,10})\s*,\s*(-?\d{1,10})\s*\)$/;
    matches = rgbRe.exec(colorString);
    if (matches) {
        return [
            parseInt(matches[1], 10),
            parseInt(matches[2], 10),
            parseInt(matches[3], 10),
            1,
        ];
    }
    // Regex for #RRGGBB or #RGB - with default alpha 1
    const hexRe = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
    matches = hexRe.exec(colorString);
    if (matches) {
        return [
            parseInt(matches[1], 16),
            parseInt(matches[2], 16),
            parseInt(matches[3], 16),
            1,
        ];
    }
    const shortHexRe = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
    matches = shortHexRe.exec(colorString);
    if (matches) {
        return [
            parseInt(matches[1] + matches[1], 16),
            parseInt(matches[2] + matches[2], 16),
            parseInt(matches[3] + matches[3], 16),
            1,
        ];
    }
    // Fallback for named colors or other formats -
    // for simplicity in this port, we'll assume white or transparent if not directly parseable.
    // In v3.8, it had a large map of named colors. We'll simplify.
    if (colorString.includes('white') || colorString === '#fff') {
        return [255, 255, 255, 1];
    }
    // Default to transparent if parsing fails. This is a simplification.
    console.warn(`[helpers.ts]Could not parse color: ${colorString}. Defaulting to transparent.`);
    return [0, 0, 0, 0];
}
/**
 * Internal helper to calculate the luminance (grayscale value) of an RGB color.
 *
 * Uses a weighted formula based on human perception (NTSC standard weights modified for this specific implementation)
 * to determine how "bright" the color is.
 *
 * @param rgbValue - The `[r, g, b, a]` tuple.
 * @returns A number representing luminance (0-255).
 */
function rgbaToGrayscale(rgbValue) {
    // Originally, the NTSC RGB to YUV formula
    const redComponentGrayscaleWeight = 0.199;
    const greenComponentGrayscaleWeight = 0.687;
    const blueComponentGrayscaleWeight = 0.114;
    return (redComponentGrayscaleWeight * rgbValue[0] +
        greenComponentGrayscaleWeight * rgbValue[1] +
        blueComponentGrayscaleWeight * rgbValue[2]);
}
/**
 * Generates a high-contrast color pair based on a given background color string.
 *
 * This utility parses CSS color strings (RGBA, RGB, Hex, or named colors) to calculate
 * the background's luminance. It then returns 'black' or 'white' as the foreground color
 * to ensure maximum readability.
 *
 * @param backgroundColor - A CSS color string (e.g., `'#FF0000'`, `'rgba(0, 0, 0, 0.5)'`).
 * @returns A {@link ContrastColors} object containing the background and the optimal foreground color.
 */
function generateContrastColors(backgroundColor) {
    const rgb = colorStringToRgba(backgroundColor);
    // If alpha is 0, foreground could be anything, but 'white' is a safe default.
    if (rgb[3] === 0) {
        return {
            background: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${rgb[3]})`,
            foreground: 'white',
        };
    }
    return {
        background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
        foreground: rgbaToGrayscale(rgb) > 160 ? 'black' : 'white',
    };
}
// #endregion Color Utilities
// #region Type Checking and Assertion Utilities
/**
 * Type guard to check if a value is a finite number.
 *
 * @param value - The value to check.
 * @returns `true` if the value is of type 'number' and is not `Infinity` or `NaN`.
 */
function isNumber(value) {
    return (typeof value === 'number') && (isFinite(value));
}
/**
 * Checks if a value is an integer number.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a number with no fractional part.
 */
function isInteger(value) {
    return (typeof value === 'number') && ((value % 1) === 0);
}
/**
 * Type guard to check if a value is a string.
 *
 * @param value - The value to check.
 * @returns `true` if the value is of type 'string'.
 */
function isString(value) {
    return typeof value === 'string';
}
/**
 * Type guard to check if a value is a boolean.
 *
 * @param value - The value to check.
 * @returns `true` if the value is of type 'boolean'.
 */
function isBoolean(value) {
    return typeof value === 'boolean';
}
/**
 * asserts that a condition is true.
 *
 * If the condition is false, this function throws an Error. This is useful for
 * invariant checking and narrowing types in TypeScript flow analysis.
 *
 * @param condition - The boolean condition to verify.
 * @param message - Optional text to include in the Error message if the assertion fails.
 * @throws Error if `condition` is `false`.
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed' + (message ? ': ' + message : ''));
    }
}
/**
 * Ensures a value is not `null`.
 *
 * This is a utility for runtime checks where TypeScript might allow `null` but the
 * logic strictly requires a value.
 *
 * @typeParam T - The type of the value.
 * @param value - The value to check.
 * @returns The value `T` (guaranteed not to be null).
 * @throws Error if `value` is `null`.
 */
function ensureNotNull(value) {
    if (value === null) {
        throw new Error('Value is null');
    }
    return value;
}
/**
 * Ensures a value is not `undefined`.
 *
 * Similar to {@link ensureNotNull}, this guarantees existence at runtime.
 *
 * @typeParam T - The type of the value.
 * @param value - The value to check.
 * @returns The value `T` (guaranteed not to be undefined).
 * @throws Error if `value` is `undefined`.
 */
function ensureDefined(value) {
    if (value === undefined) {
        throw new Error('Value is undefined');
    }
    return value;
}
// #endregion
// #region Object Manipulation Utilities
/**
 * Creates a deep copy of an object, array, or Date.
 *
 * This recursive function ensures that nested structures are duplicated rather than
 * referenced, preventing side effects when modifying configuration objects or state.
 *
 * @typeParam T - The type of the object being copied.
 * @param object - The source object to copy.
 * @returns A strictly typed deep copy of the input.
 */
function deepCopy(object) {
    // If not an object or null, return the value as is (base case)
    if (typeof object !== 'object' || object === null) {
        return object;
    }
    // Handle Date objects
    if (object instanceof Date) {
        return new Date(object.getTime());
    }
    // Handle Arrays
    if (Array.isArray(object)) {
        // Recursively deep copy each element in the array
        return object.map(item => deepCopy(item));
    }
    // Handle plain objects
    const copy = {};
    for (const key in object) {
        // Ensure we only copy own properties and not inherited ones
        if (Object.prototype.hasOwnProperty.call(object, key)) {
            // Recursively deep copy the value of the property
            copy[key] = deepCopy(object[key]);
        }
    }
    return copy;
}
/**
 * Deeply merges multiple source objects into a destination object.
 *
 * **Special Behavior for Arrays:**
 * Unlike standard merges, if a source array is shorter than the destination array,
 * the destination array is truncated to match the length of the source. This prevents
 * stale data (e.g., old points) from lingering when a tool is updated with fewer points.
 *
 * @param dst - The target object to modify.
 * @param sources - One or more source objects to merge properties from.
 * @returns The modified `dst` object.
 */
function merge(dst, ...sources) {
    for (const src of sources) {
        for (const key in src) {
            if (src[key] === undefined) {
                continue;
            }
            const srcValue = src[key];
            const dstValue = dst[key];
            if (Array.isArray(srcValue) && Array.isArray(dstValue)) {
                // Trim destination array if source is shorter
                if (srcValue.length < dstValue.length) {
                    dstValue.length = srcValue.length;
                }
                for (let i = 0; i < srcValue.length; i++) {
                    const srcElement = srcValue[i];
                    const dstElement = dstValue[i];
                    if (typeof srcElement !== 'object' || srcElement === null || dstElement === undefined) {
                        dstValue[i] = srcElement;
                    }
                    else if (typeof dstElement === 'object' && dstElement !== null) {
                        // Recursively merge nested object properties
                        merge(dstValue[i], srcValue[i]);
                    }
                    else {
                        // Overwrite non-object or non-existing properties
                        dstValue[i] = srcElement;
                    }
                }
            }
            else if (typeof srcValue === 'object' && srcValue !== null && typeof dstValue === 'object' && dstValue !== null) {
                // Recursively merge nested object properties
                merge(dstValue, srcValue);
            }
            else {
                // Overwrite non-object or non-existing properties
                dst[key] = srcValue;
            }
        }
    }
    return dst;
}
// #endregion
// #region Unique ID Generation
const HASH_SOURCE = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
/**
 * Generates a random alphanumeric hash string.
 *
 * Used primarily for generating unique identifiers (`id`) for new line tools
 * if one is not provided by the user.
 *
 * @param count - The length of the hash to generate (default is 12).
 * @returns A random string.
 */
function randomHash(count = 12) {
    let hash = '';
    for (let i = 0; i < count; ++i) {
        const index = Math.floor(Math.random() * HASH_SOURCE.length);
        hash += HASH_SOURCE[index];
    }
    return hash;
}
// #endregion
// #region Font and Canvas Helpers
/**
 * The default font stack used by the plugin for text rendering.
 * Value: `'Trebuchet MS', Roboto, Ubuntu, sans-serif`
 */
const defaultFontFamily = `'Trebuchet MS', Roboto, Ubuntu, sans-serif`;
/**
 * Constructs a valid CSS font string for the HTML5 Canvas context.
 *
 * @param size - The font size in pixels.
 * @param family - The font family (defaults to {@link defaultFontFamily}).
 * @param style - Optional style (e.g., `'bold'`, `'italic'`).
 * @returns A string like `"bold 14px 'Trebuchet MS'"`.
 */
function makeFont(size, family, style) {
    if (style) {
        style = `${style} `;
    }
    else {
        style = '';
    }
    if (!family) {
        family = defaultFontFamily;
    }
    return `${style}${size}px ${family}`;
}
/**
 * A robust event dispatcher implementation.
 *
 * This class mimics the internal `Delegate` used by Lightweight Charts. It maintains a list
 * of subscribers and broadcasts events to them. It supports linking subscriptions to specific
 * objects for bulk-unsubscribe and "singleshot" (one-time) listeners.
 */
class Delegate {
    constructor() {
        /**
         * Internal list of active subscribers.
         * @private
         */
        this._listeners = [];
    }
    /**
     * Subscribes a callback function to the delegate.
     *
     * When the event is fired, this callback will be executed with the provided arguments.
     *
     * @param callback - The function to call when the event fires.
     * @param linkedObject - An optional object to link the subscription to. This allows removing multiple unrelated subscriptions at once via {@link unsubscribeAll}.
     * @param singleshot - If `true`, the subscription is automatically removed after the first time it is called.
     */
    subscribe(callback, linkedObject, singleshot) {
        const listener = {
            callback,
            linkedObject,
            singleshot: singleshot === true,
        };
        this._listeners.push(listener);
    }
    /**
     * Unsubscribes a specific callback function from the delegate.
     *
     * If the callback was added multiple times, this typically removes the first occurrence
     * depending on implementation, though delegates usually enforce unique callback references per subscription context.
     *
     * @param callback - The specific function reference to remove.
     */
    unsubscribe(callback) {
        const index = this._listeners.findIndex(listener => callback === listener.callback);
        if (index > -1) {
            this._listeners.splice(index, 1);
        }
    }
    /**
     * Unsubscribes all callbacks that were registered with a specific `linkedObject`.
     *
     * This is useful for cleaning up all event listeners associated with a specific UI component
     * or tool instance when it is destroyed.
     *
     * @param linkedObject - The object key used during subscription.
     */
    unsubscribeAll(linkedObject) {
        this._listeners = this._listeners.filter(listener => listener.linkedObject !== linkedObject);
    }
    /**
     * Fires the event, calling all subscribed callbacks with the provided arguments.
     *
     * This method takes a snapshot of the listeners array before iterating to ensure that
     * if a listener unsubscribes itself during execution, the iteration remains stable.
     *
     * @param param1 - The first event argument.
     * @param param2 - The second event argument.
     * @param param3 - The third event argument.
     */
    fire(param1, param2, param3) {
        // Create a snapshot of listeners to prevent issues if listeners modify the array during firing
        const listenersSnapshot = [...this._listeners];
        // Filter out singleshot listeners if they were not removed by their own callback
        this._listeners = this._listeners.filter(listener => !listener.singleshot);
        listenersSnapshot.forEach(listener => listener.callback(param1, param2, param3));
    }
    /**
     * Checks if the delegate has any active listeners.
     *
     * This is useful for avoiding expensive calculations if no one is listening to the event.
     *
     * @returns `true` if there is at least one active subscriber, `false` otherwise.
     */
    hasListeners() {
        return this._listeners.length > 0;
    }
    /**
     * Clears all listeners and frees up resources.
     *
     * This should be called when the owner of the Delegate (e.g., the Plugin or a Tool)
     * is being destroyed to prevent memory leaks.
     */
    destroy() {
        this._listeners = [];
    }
}
// #endregion DeepPartial and OmitRecursively Type Definitions

// /src/model/tool-registry.ts
/**
 * A registry for mapping line tool type names to their corresponding class constructors.
 *
 * This class ensures that when a tool is requested by its string identifier (e.g., `'Rectangle'`),
 * the plugin can reliably retrieve the correct class constructor to dynamically instantiate the tool.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class ToolRegistry {
    constructor() {
        /**
         * Private map to store the registered tool classes.
         * Key: {@link LineToolType} string (e.g., 'Rectangle')
         * Value: Constructor of a class that extends {@link BaseLineTool}
         * @private
         */
        this._toolConstructors = new Map();
    }
    /**
     * Registers a new line tool class with the registry.
     *
     * This method is typically called via the public {@link LineToolsCorePlugin.registerLineTool} API
     * to make a custom tool available for creation.
     *
     * @param type - The string identifier for the tool (e.g., 'Rectangle').
     * @param toolClass - The constructor of the class that extends {@link BaseLineTool}.
     * @returns void
     */
    registerTool(type, toolClass) {
        if (this._toolConstructors.has(type)) {
            console.warn(`Line tool type "${type}" is already registered and will be overwritten.`);
        }
        this._toolConstructors.set(type, toolClass);
    }
    /**
     * Checks if a line tool of a specific type has been registered.
     *
     * @param type - The line tool type to check.
     * @returns `true` if the tool is registered, otherwise `false`.
     */
    isRegistered(type) {
        return this._toolConstructors.has(type);
    }
    /**
     * Retrieves the constructor for a specific line tool type.
     *
     * @param type - The line tool type to retrieve.
     * @returns The class constructor if found.
     * @throws Will throw an error if the tool type is not registered.
     */
    getToolClass(type) {
        const toolClass = this._toolConstructors.get(type);
        if (!toolClass) {
            throw new Error(`Line tool type "${type}" is not registered. Ensure you have imported and registered the tool.`);
        }
        return toolClass;
    }
}

// /src/types.ts
/**
 * Defines vertical alignment options for box-like elements (e.g., text boxes).
 */
var BoxVerticalAlignment;
(function (BoxVerticalAlignment) {
    BoxVerticalAlignment["Top"] = "top";
    BoxVerticalAlignment["Middle"] = "middle";
    BoxVerticalAlignment["Bottom"] = "bottom";
})(BoxVerticalAlignment || (BoxVerticalAlignment = {}));
/**
 * Defines horizontal alignment options for box-like elements relative to a reference point.
 */
var BoxHorizontalAlignment;
(function (BoxHorizontalAlignment) {
    BoxHorizontalAlignment["Left"] = "left";
    BoxHorizontalAlignment["Center"] = "center";
    BoxHorizontalAlignment["Right"] = "right";
})(BoxHorizontalAlignment || (BoxHorizontalAlignment = {}));
/**
 * Defines the alignment of text content within its bounding box.
 */
var TextAlignment;
(function (TextAlignment) {
    TextAlignment["Start"] = "start";
    TextAlignment["Center"] = "center";
    TextAlignment["End"] = "end";
    TextAlignment["Left"] = "left";
    TextAlignment["Right"] = "right";
})(TextAlignment || (TextAlignment = {}));
/**
 * Defines the shape used to join two line segments where they meet.
 * Matches standard Canvas API `lineJoin` property.
 */
var LineJoin;
(function (LineJoin) {
    LineJoin["Bevel"] = "bevel";
    LineJoin["Round"] = "round";
    LineJoin["Miter"] = "miter";
})(LineJoin || (LineJoin = {}));
/**
 * Defines the shape used to draw the end points of lines.
 * Matches standard Canvas API `lineCap` property.
 */
var LineCap;
(function (LineCap) {
    LineCap["Butt"] = "butt";
    LineCap["Round"] = "round";
    LineCap["Square"] = "square";
})(LineCap || (LineCap = {}));
/**
 * Defines specific decorative shapes to render at the start or end of a line tool
 * (e.g., Arrow heads or Circles).
 */
var LineEnd;
(function (LineEnd) {
    LineEnd[LineEnd["Normal"] = 0] = "Normal";
    LineEnd[LineEnd["Arrow"] = 1] = "Arrow";
    LineEnd[LineEnd["Circle"] = 2] = "Circle";
})(LineEnd || (LineEnd = {}));
/**
 * Enum defining the standard CSS cursor styles supported by the chart.
 *
 * These values are returned by `hitTest` to instruct the chart to change the mouse cursor
 * (e.g., to 'pointer', 'grabbing', or 'ew-resize') when hovering over a tool.
 */
var PaneCursorType;
(function (PaneCursorType) {
    PaneCursorType["Default"] = "default";
    PaneCursorType["Crosshair"] = "crosshair";
    PaneCursorType["Pointer"] = "pointer";
    PaneCursorType["Grabbing"] = "grabbing";
    PaneCursorType["VerticalResize"] = "n-resize";
    PaneCursorType["HorizontalResize"] = "e-resize";
    PaneCursorType["DiagonalNeSwResize"] = "nesw-resize";
    PaneCursorType["DiagonalNwSeResize"] = "nwse-resize";
    PaneCursorType["NotAllowed"] = "not-allowed";
    PaneCursorType["Move"] = "move";
    PaneCursorType["Auto"] = "auto";
    PaneCursorType["None"] = "none";
    PaneCursorType["ContextMenu"] = "context-menu";
    PaneCursorType["Help"] = "help";
    PaneCursorType["Progress"] = "progress";
    PaneCursorType["Wait"] = "wait";
    PaneCursorType["Cell"] = "cell";
    PaneCursorType["Text"] = "text";
    PaneCursorType["VerticalText"] = "vertical-text";
    PaneCursorType["Alias"] = "alias";
    PaneCursorType["Copy"] = "copy";
    PaneCursorType["NoDrop"] = "no-drop";
    PaneCursorType["Grab"] = "grab";
    PaneCursorType["EResize"] = "e-resize";
    PaneCursorType["NResize"] = "n-resize";
    PaneCursorType["NeResize"] = "ne-resize";
    PaneCursorType["NwResize"] = "nw-resize";
    PaneCursorType["SResize"] = "s-resize";
    PaneCursorType["SeResize"] = "se-resize";
    PaneCursorType["SwResize"] = "sw-resize";
    PaneCursorType["WResize"] = "w-resize";
    PaneCursorType["EwResize"] = "ew-resize";
    PaneCursorType["NsResize"] = "ns-resize";
    PaneCursorType["NeswResize"] = "nesw-resize";
    PaneCursorType["NwseResize"] = "nwse-resize";
    PaneCursorType["ColResize"] = "col-resize";
    PaneCursorType["RowResize"] = "row-resize";
    PaneCursorType["AllScroll"] = "all-scroll";
    PaneCursorType["ZoomIn"] = "zoom-in";
    PaneCursorType["ZoomOut"] = "zoom-out";
})(PaneCursorType || (PaneCursorType = {}));
/**
 * Represents the successful result of a hit test on a rendered object.
 *
 * It encapsulates:
 * 1. The `type` of hit (e.g., did we hit an anchor point or the body?).
 * 2. Associated `data` (e.g., which specific anchor point index was clicked?).
 */
class HitTestResult {
    constructor(type, data) {
        this._type = type;
        this._data = data || null;
    }
    type() {
        return this._type;
    }
    data() {
        return this._data;
    }
}
/**
 * Categorizes the nature of a hit test result.
 *
 * - `Regular`: General hover (defaults to pointer).
 * - `MovePoint`: Hit an anchor or handle intended for resizing/moving a specific point.
 * - `MovePointBackground`: Hit the body/background intended for dragging the entire tool.
 * - `ChangePoint`: Specific variation often used for anchor resizing.
 * - `Custom`: Generic fallback for specialized tools.
 */
var HitTestType;
(function (HitTestType) {
    HitTestType[HitTestType["Regular"] = 1] = "Regular";
    HitTestType[HitTestType["MovePoint"] = 2] = "MovePoint";
    HitTestType[HitTestType["MovePointBackground"] = 3] = "MovePointBackground";
    HitTestType[HitTestType["ChangePoint"] = 4] = "ChangePoint";
    HitTestType[HitTestType["Custom"] = 5] = "Custom";
})(HitTestType || (HitTestType = {}));
// #endregion Pane Renderer Data Structures
// #region  Interaction & Internal Logic
/**
 * Defines the current state of user interaction with a line tool.
 *
 * This is used by the `InteractionManager` and the tool's constraint logic (e.g., `getShiftConstrainedPoint`)
 * to determine how input should be handled.
 *
 * - `Creation`: The user is actively drawing the tool (placing points).
 * - `Editing`: The user is dragging a specific anchor point to resize/reshape the tool.
 * - `Move`: The user is dragging the entire tool body to translate it.
 */
var InteractionPhase;
(function (InteractionPhase) {
    /** The tool is currently being drawn by the user (ghost point is active). */
    InteractionPhase["Creation"] = "creation";
    /** A point anchor is being dragged to modify the tool's geometry. */
    InteractionPhase["Editing"] = "editing";
    /** The entire tool is being dragged/translated. (Shift constraint usually ignored here). */
    InteractionPhase["Move"] = "move";
})(InteractionPhase || (InteractionPhase = {}));
/**
 * Defines the user action required to finish creating a specific line tool.
 *
 * - `PointCount`: Automatically finishes when the required number of points (e.g., 2 for a Rectangle) are placed.
 * - `MouseUp`: Finishes immediately when the mouse button is released (used for "Drag-to-Create" or freehand tools like Brush).
 * - `DoubleClick`: Finishes when the user double-clicks (used for Polyline/Path tools with variable point counts).
 */
var FinalizationMethod;
(function (FinalizationMethod) {
    FinalizationMethod["PointCount"] = "pointCount";
    FinalizationMethod["MouseUp"] = "mouseUp";
    FinalizationMethod["DoubleClick"] = "doubleClick";
})(FinalizationMethod || (FinalizationMethod = {}));
// #endregion  Interaction & Internal Logic

// /src/utils/geometry.ts
// --- Local Redefinitions of Geometric Primitives (from V3.8 model/point.ts) ---
/**
 * Represents a 2D point or vector in the chart's coordinate system.
 *
 * This class provides standard vector arithmetic operations required for geometric calculations,
 * hit testing, and rendering logic.
 */
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    /**
     * Adds another point/vector to this one.
     * @param point - The point to add.
     * @returns A new Point representing the sum (`this + point`).
     */
    add(point) {
        return new Point(this.x + point.x, this.y + point.y);
    }
    /**
     * Adds a scaled version of another point/vector to this one.
     * Useful for linear interpolations or projections.
     *
     * @param point - The direction vector to add.
     * @param scale - The scalar factor to multiply `point` by before adding.
     * @returns A new Point representing (`this + (point * scale)`).
     */
    addScaled(point, scale) {
        return new Point(this.x + scale * point.x, this.y + scale * point.y);
    }
    /**
     * Subtracts another point/vector from this one.
     * @param point - The point to subtract.
     * @returns A new Point representing the difference (`this - point`).
     */
    subtract(point) {
        return new Point(this.x - point.x, this.y - point.y);
    }
    /**
     * Calculates the dot product of this vector and another.
     * Formula: `x1*x2 + y1*y2`.
     *
     * @param point - The other vector.
     * @returns The scalar dot product.
     */
    dotProduct(point) {
        return this.x * point.x + this.y * point.y;
    }
    /**
     * Calculates the 2D cross product (determinant) magnitude of this vector and another.
     * Formula: `x1*y2 - y1*x2`.
     *
     * @param point - The other vector.
     * @returns The scalar cross product.
     */
    crossProduct(point) {
        return this.x * point.y - this.y * point.x;
    }
    /**
     * Calculates the signed angle between this vector and another.
     *
     * @param point - The other vector.
     * @returns The angle in radians (range -π to π).
     */
    signedAngle(point) {
        return Math.atan2(this.crossProduct(point), this.dotProduct(point));
    }
    /**
     * Calculates the unsigned angle between this vector and another.
     *
     * @param point - The other vector.
     * @returns The angle in radians (range 0 to π).
     */
    angle(point) {
        return Math.acos(this.dotProduct(point) / (this.length() * point.length()));
    }
    /**
     * Calculates the Euclidean length (magnitude) of the vector.
     * @returns The length of the vector.
     */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    /**
     * Multiplies the vector by a scalar value.
     * @param scale - The scaling factor.
     * @returns A new scaled Point.
     */
    scaled(scale) {
        return new Point(this.x * scale, this.y * scale);
    }
    /**
      * Returns a normalized version of the vector (unit vector with length 1).
      * @returns A new Point with the same direction but length 1. Returns (0,0) if original length is 0.
      */
    normalized() {
        const len = this.length();
        if (len === 0)
            return new Point(0, 0);
        return new Point(this.x / len, this.y / len);
    }
    /**
     * Returns a perpendicular vector rotated 90 degrees counter-clockwise.
     * Maps `(x, y)` to `(-y, x)`.
     *
     * @returns A new transposed Point.
     */
    transposed() {
        return new Point(-this.y, this.x);
    }
    /**
     * Creates a deep copy of this Point.
     * @returns A new Point instance with identical coordinates.
     */
    clone() {
        return new Point(this.x, this.y);
    }
}
/**
 * Represents an Axis-Aligned Bounding Box (AABB) defined by two corner points.
 *
 * The box is normalized upon construction so that `min` always contains the
 * smallest x and y values, and `max` contains the largest.
 */
class Box {
    constructor(a, b) {
        this.min = new Point(Math.min(a.x, b.x), Math.min(a.y, b.y));
        this.max = new Point(Math.max(a.x, b.x), Math.max(a.y, b.y));
    }
}
/**
 * Represents a geometric half-plane, defined by a dividing line (edge) and a boolean
 * indicating which side of the line is considered "inside" or positive.
 *
 * Used primarily for polygon clipping algorithms (e.g., Sutherland-Hodgman).
 */
class HalfPlane {
    constructor(edge, isPositive) {
        this.edge = edge;
        this.isPositive = isPositive;
    }
}
// #region Point & Geometric Primitives (from V3.8 model/point.ts)
// Note: The Point class and related primitives are moved here as they are fundamental geometry utilities.
/**
 * Checks if two points are geometrically identical.
 *
 * @param a - The first point.
 * @param b - The second point.
 * @returns `true` if both x and y coordinates match exactly, otherwise `false`.
 */
function equalPoints(a, b) {
    return a.x === b.x && a.y === b.y;
}
/**
 * Factory function to create a {@link Line} object from coefficients.
 *
 * Creates a line object satisfying the equation `ax + by + c = 0`.
 *
 * @param a - The 'a' coefficient (coefficient of x).
 * @param b - The 'b' coefficient (coefficient of y).
 * @param c - The 'c' constant term.
 * @returns A {@link Line} object.
 */
function line(a, b, c) {
    return { a, b, c };
}
/**
 * Constructs a {@link Line} that passes through two distinct points.
 *
 * Derives the general equation coefficients `a`, `b`, and `c` based on the coordinates
 * of the provided points.
 *
 * @param a - The first point.
 * @param b - The second point.
 * @returns A {@link Line} object representing the infinite line through `a` and `b`.
 */
function lineThroughPoints(a, b) {
    return line(a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y);
}
/**
 * Factory function to create a {@link Segment} tuple.
 *
 * @param a - The start point.
 * @param b - The end point.
 * @returns A tuple `[a, b]`.
 * @throws Error if `a` and `b` are the same point (segments must be distinct).
 */
function lineSegment(a, b) {
    if (equalPoints(a, b)) {
        throw new Error('Points of a segment should be distinct');
    }
    return [a, b];
}
/**
 * Constructs a {@link HalfPlane} defined by a boundary edge and a reference point.
 *
 * The resulting half-plane includes the side of the `edge` line where `point` resides.
 *
 * @param edge - The infinite line defining the boundary.
 * @param point - A point strictly inside the desired half-plane.
 * @returns A {@link HalfPlane} object.
 */
function halfPlaneThroughPoint(edge, point) {
    return new HalfPlane(edge, edge.a * point.x + edge.b * point.y + edge.c > 0);
}
/**
 * Checks if a specific point lies within a defined {@link HalfPlane}.
 *
 * It evaluates the line equation `ax + by + c` at the point's coordinates and compares
 * the sign of the result against the half-plane's positive/negative orientation.
 *
 * @param point - The point to test.
 * @param halfPlane - The geometric half-plane definition.
 * @returns `true` if the point is strictly inside the half-plane, `false` otherwise.
 */
function pointInHalfPlane(point, halfPlane) {
    const edge = halfPlane.edge;
    return (edge.a * point.x + edge.b * point.y + edge.c > 0) === halfPlane.isPositive;
}
/**
 * Checks if two bounding boxes are geometrically identical.
 *
 * Equality requires that both the `min` and `max` points of the boxes match exactly.
 *
 * @param a - The first bounding box.
 * @param b - The second bounding box.
 * @returns `true` if the boxes occupy exactly the same space.
 */
function equalBoxes(a, b) {
    return equalPoints(a.min, b.min) && equalPoints(a.max, b.max);
}
// #endregion
// #region Intersection & Distance Functions (from V3.8 model/intersection.ts)
/**
 * Clips an arbitrary polygon against the rectangular viewport boundaries.
 *
 * This implementation uses the Sutherland-Hodgman algorithm to iteratively clip the polygon
 * against the four edges of the screen (0, 0, Width, Height).
 *
 * @param points - The array of vertices defining the polygon.
 * @param W - The width of the viewport in pixels.
 * @param H - The height of the viewport in pixels.
 * @returns An array of points representing the clipped polygon, or `null` if the polygon is fully outside.
 */
function clipPolygonToViewport(points, W, H) {
    if (points.length < 3)
        return null;
    let clippedPoints = points;
    const clipPlanes = [];
    // 1. Define the four clipping planes (HalfPlanes) based on the viewport boundaries.
    // Clip against X > 0 (Left Edge)
    // Edge: x = 0 (Line: a=1, b=0, c=0). Point (1, 1) is inside.
    clipPlanes.push(halfPlaneThroughPoint(line(1, 0, 0), new Point(1, 1)));
    // Clip against X < W (Right Edge)
    // Edge: x = W (Line: a=1, b=0, c=-W). Point (W-1, 1) is inside.
    clipPlanes.push(halfPlaneThroughPoint(line(1, 0, -W), new Point((W - 1), 1)));
    // Clip against Y > 0 (Top Edge)
    // Edge: y = 0 (Line: a=0, b=1, c=0). Point (1, 1) is inside.
    clipPlanes.push(halfPlaneThroughPoint(line(0, 1, 0), new Point(1, 1)));
    // Clip against Y < H (Bottom Edge)
    // Edge: y = H (Line: a=0, b=1, c=-H). Point (1, H-1) is inside.
    clipPlanes.push(halfPlaneThroughPoint(line(0, 1, -H), new Point(1, (H - 1))));
    // 2. Iteratively clip the polygon against each plane.
    for (const plane of clipPlanes) {
        const nextClipped = intersectPolygonAndHalfPlane(clippedPoints, plane);
        if (nextClipped === null || nextClipped.length < 3) {
            return null; // Fully clipped out
        }
        clippedPoints = nextClipped;
    }
    return clippedPoints;
}
/**
 * Internal helper to add a unique point to an array.
 *
 * Checks if the `point` already exists in the `array` (using geometric equality).
 * If it does not exist, it pushes the point and returns `true`.
 *
 * @param array - The target array of points.
 * @param point - The point to attempt to add.
 * @returns `true` if the point was added, `false` if it was a duplicate.
 */
function addPoint(array, point) {
    for (let i = 0; i < array.length; i++) {
        if (equalPoints(array[i], point)) {
            return false;
        }
    }
    array.push(point);
    return true;
}
/**
 * Calculates the intersection geometry between an infinite {@link Line} and an axis-aligned {@link Box}.
 *
 * @param line - The infinite line equation (`ax + by + c = 0`).
 * @param box - The bounding box.
 * @returns A {@link Segment} (if passing through), a single {@link Point} (if touching a corner/edge tangentially), or `null` (if no intersection).
 */
function intersectLineAndBox(line, box) {
    if (line.a === 0) {
        const l = -line.c / line.b;
        return box.min.y <= l && l <= box.max.y ? lineSegment(new Point(box.min.x, l), new Point(box.max.x, l)) : null;
    }
    if (line.b === 0) {
        const h = -line.c / line.a;
        return box.min.x <= h && h <= box.max.x ? lineSegment(new Point(h, box.min.y), new Point(h, box.max.y)) : null;
    }
    const points = [];
    const u = function (value) {
        const i = -(line.c + line.a * value) / line.b;
        if (box.min.y <= i && i <= box.max.y) {
            addPoint(points, new Point(value, i));
        }
    };
    const p = function (value) {
        const s = -(line.c + line.b * value) / line.a;
        if (box.min.x <= s && s <= box.max.x) {
            addPoint(points, new Point(s, value));
        }
    };
    u(box.min.x);
    p(box.min.y);
    u(box.max.x);
    p(box.max.y);
    switch (points.length) {
        case 0:
            return null;
        case 1:
            return points[0];
        case 2:
            return equalPoints(points[0], points[1]) ? points[0] : lineSegment(points[0], points[1]);
    }
    throw new Error('We should have at most two intersection points');
}
/**
 * Calculates the intersection point of a Ray (semi-infinite line) and a bounding box.
 *
 * A ray is defined by an origin (`point0`) and a through-point (`point1`). This function finds
 * the first point where the ray enters or touches the box.
 *
 * @param point0 - The origin of the ray.
 * @param point1 - A second point defining the ray's direction.
 * @param box - The bounding box to test against.
 * @returns The first intersection {@link Point}, or `null` if the ray misses the box.
 */
function intersectRayAndBox(point0, point1, box) {
    const s = intersectLineSegments(point0, point1, box.min, new Point(box.max.x, box.min.y));
    const n = intersectLineSegments(point0, point1, new Point(box.max.x, box.min.y), box.max);
    const a = intersectLineSegments(point0, point1, box.max, new Point(box.min.x, box.max.y));
    const c = intersectLineSegments(point0, point1, new Point(box.min.x, box.max.y), box.min);
    const h = [];
    if (s !== null && s >= 0) {
        h.push(s);
    }
    if (n !== null && n >= 0) {
        h.push(n);
    }
    if (a !== null && a >= 0) {
        h.push(a);
    }
    if (c !== null && c >= 0) {
        h.push(c);
    }
    if (h.length === 0) {
        return null;
    }
    h.sort((e, t) => e - t);
    const d = pointInBox(point0, box) ? h[0] : h[h.length - 1];
    return point0.addScaled(point1.subtract(point0), d);
}
/**
 * Calculates the intersection of two finite line segments.
 *
 * Segment A is defined by `point0` to `point1`.
 * Segment B is defined by `point2` to `point3`.
 *
 * @param point0 - Start of segment A.
 * @param point1 - End of segment A.
 * @param point2 - Start of segment B.
 * @param point3 - End of segment B.
 * @returns The scalar coefficient `t` (0 to 1) along segment A where the intersection occurs, or `null` if they do not intersect.
 */
function intersectLineSegments(point0, point1, point2, point3) {
    const z = (function (e, t, i, s) {
        const r = t.subtract(e);
        const n = s.subtract(i);
        const o = r.x * n.y - r.y * n.x;
        if (Math.abs(o) < 1e-6) {
            return null;
        }
        const a = e.subtract(i);
        return (a.y * n.x - a.x * n.y) / o;
    })(point0, point1, point2, point3);
    if (z === null) {
        return null;
    }
    const o = point1.subtract(point0).scaled(z).add(point0);
    const a = distanceToSegment(point2, point3, o);
    return Math.abs(a.distance) < 1e-6 ? z : null;
}
/**
 * Clips a finite line segment to a bounding box using the Cohen-Sutherland algorithm.
 *
 * This determines which part of the segment `[p0, p1]` lies inside the box.
 *
 * @param segment - The input segment `[start, end]`.
 * @param box - The clipping boundary.
 * @returns A new {@link Segment} representing the visible portion, a single {@link Point} if clipped to a dot, or `null` if completely outside.
 */
function intersectLineSegmentAndBox(segment, box) {
    // Explicitly define types for x0, y0, x1, y1 as Coordinate
    let x0 = segment[0].x;
    let y0 = segment[0].y;
    let x1 = segment[1].x;
    let y1 = segment[1].y;
    const minX = box.min.x;
    const minY = box.min.y;
    const maxX = box.max.x;
    const maxY = box.max.y;
    // This helper function `outcode` will operate on numbers and return numbers
    function outcode(n1, n2) {
        let z = 0; // 0000
        if (n1 < minX)
            z |= 1; // 0001
        else if (n1 > maxX)
            z |= 2; // 0010
        if (n2 < minY)
            z |= 4; // 0100
        else if (n2 > maxY)
            z |= 8; // 1000
        return z;
    }
    let accept = false; // Correctly track acceptance
    let outcode0 = outcode(x0, y0);
    let outcode1 = outcode(x1, y1);
    while (true) {
        if (!(outcode0 | outcode1)) {
            accept = true;
            break;
        }
        else if (outcode0 & outcode1) {
            break;
        }
        else {
            const currentOutcode = outcode0 || outcode1;
            let x = 0;
            let y = 0;
            if (currentOutcode & 8) { // Point is above the clip window
                x = x0 + (x1 - x0) * (maxY - y0) / (y1 - y0);
                y = maxY;
            }
            else if (currentOutcode & 4) { // Point is below the clip window
                x = x0 + (x1 - x0) * (minY - y0) / (y1 - y0);
                y = minY;
            }
            else if (currentOutcode & 2) { // Point is to the right of clip window
                y = y0 + (y1 - y0) * (maxX - x0) / (x1 - x0);
                x = maxX;
            }
            else if (currentOutcode & 1) { // Point is to the left of clip window
                y = y0 + (y1 - y0) * (minX - x0) / (x1 - x0);
                x = minX;
            }
            // Assigning back to Coordinate-typed variables requires an explicit cast
            if (currentOutcode === outcode0) {
                x0 = x;
                y0 = y;
                outcode0 = outcode(x0, y0);
            }
            else {
                x1 = x;
                y1 = y;
                outcode1 = outcode(x1, y1);
            }
        }
    }
    return accept ? (equalPoints(new Point(x0, y0), new Point(x1, y1)) ? new Point(x0, y0) : lineSegment(new Point(x0, y0), new Point(x1, y1))) : null;
}
/**
 * Calculates the shortest (perpendicular) distance from a point to an infinite line.
 *
 * The line is defined by two points, `point1` and `point2`. The target is `point0`.
 *
 * @param point0 - The target point to measure from.
 * @param point1 - First point on the line.
 * @param point2 - Second point on the line.
 * @returns An object containing the `distance` (pixels) and a `coeff` representing the projection of `point0` onto the line vector.
 */
function distanceToLine(point0, point1, point2) {
    const s = point1.subtract(point0);
    const r = point2.subtract(point0).dotProduct(s) / s.dotProduct(s);
    return { coeff: r, distance: point0.addScaled(s, r).subtract(point2).length() };
}
/**
 * Calculates the shortest distance from a point to a finite line segment.
 *
 * Unlike {@link distanceToLine}, this clamps the result to the segment endpoints.
 * If the perpendicular projection falls outside the segment, the distance to the closest endpoint is returned.
 *
 * @param point0 - The target point.
 * @param point1 - Start of the segment.
 * @param point2 - End of the segment.
 * @returns An object containing the `distance` and a `coeff` (0 to 1) indicating the position of the closest point on the segment.
 */
function distanceToSegment(point0, point1, point2) {
    const lineDist = distanceToLine(point0, point1, point2);
    if (lineDist.coeff >= 0 && lineDist.coeff <= 1) {
        return lineDist;
    }
    const n = point0.subtract(point2).length();
    const o = point1.subtract(point2).length();
    return n < o ? { coeff: 0, distance: n } : { coeff: 1, distance: o };
}
/**
 * Checks if a point lies strictly inside or on the edge of a bounding box.
 *
 * @param point - The point to test.
 * @param box - The axis-aligned bounding box.
 * @returns `true` if `min.x <= x <= max.x` and `min.y <= y <= max.y`.
 */
function pointInBox(point, box) {
    return point.x >= box.min.x && point.x <= box.max.x && point.y >= box.min.y && point.y <= box.max.y;
}
/**
 * Checks if a point lies inside a specific polygon.
 *
 * This implements the **Ray Casting algorithm** (also known as the Even-Odd rule).
 * It shoots a horizontal ray from the test point and counts how many times it intersects
 * the polygon's edges. An odd number of intersections means the point is inside.
 *
 * @param point - The point to test.
 * @param polygon - An array of points defining the polygon vertices.
 * @returns `true` if the point is strictly inside the polygon.
 */
function pointInPolygon(point, polygon) {
    const x = point.x;
    const y = point.y;
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect)
            isInside = !isInside;
    }
    return isInside;
}
/**
 * Checks if a point lies inside a triangle defined by three vertices.
 *
 * It uses a barycentric coordinate approach or edge-check logic. Specifically, this implementation
 * checks if the point lies on the same side of all three edges relative to the centroid (or checks intersection against medians).
 *
 * @param point - The point to test.
 * @param end0 - The first vertex.
 * @param end1 - The second vertex.
 * @param end2 - The third vertex.
 * @returns `true` if the point is inside the triangle.
 */
function pointInTriangle(point, end0, end1, end2) {
    const middle = end0.add(end1).scaled(0.5).add(end2).scaled(0.5);
    return intersectLineSegments(end0, end1, middle, point) === null
        && intersectLineSegments(end1, end2, middle, point) === null
        && intersectLineSegments(end2, end0, middle, point) === null;
}
/**
 * Calculates the exact intersection point of two infinite lines.
 *
 * Uses the general line equation (`Ax + By + C = 0`) determinant method.
 *
 * @param line0 - The first infinite line.
 * @param line1 - The second infinite line.
 * @returns The intersection {@link Point}, or `null` if the lines are parallel (determinant is near zero).
 */
function intersectLines(line0, line1) {
    const c = line0.a * line1.b - line1.a * line0.b;
    if (Math.abs(c) < 1e-6) {
        return null;
    }
    const x = (line0.b * line1.c - line1.b * line0.c) / c;
    const y = (line1.a * line0.c - line0.a * line1.c) / c;
    return new Point(x, y);
}
/**
 * Clips a polygon against a single half-plane using the Sutherland-Hodgman algorithm logic.
 *
 * This is a fundamental step in polygon clipping. It iterates through the polygon edges
 * and outputs a new set of vertices that lie on the "positive" side of the half-plane.
 *
 * @param points - The vertices of the subject polygon.
 * @param halfPlane - The clipping plane.
 * @returns A new array of vertices representing the clipped polygon, or `null` if the result is invalid (fewer than 3 points).
 */
function intersectPolygonAndHalfPlane(points, halfPlane) {
    const intersectionPoints = [];
    for (let i = 0; i < points.length; ++i) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        // --- Check for null return from lineThroughPoints ---
        const segmentLine = lineThroughPoints(current, next);
        // If the segment is degenerate (current === next), skip this iteration as no line exists
        if (segmentLine === null) {
            continue;
        }
        // Use a temporary variable 'line' for clarity, which now holds a non-null Line object
        const line = segmentLine;
        if (pointInHalfPlane(current, halfPlane)) {
            addPointToPointsSet(intersectionPoints, current);
            if (!pointInHalfPlane(next, halfPlane)) {
                const lineIntersection = intersectLines(line, halfPlane.edge);
                if (lineIntersection !== null) {
                    addPointToPointsSet(intersectionPoints, lineIntersection);
                }
            }
        }
        else if (pointInHalfPlane(next, halfPlane)) {
            const lineIntersection = intersectLines(line, halfPlane.edge);
            if (lineIntersection !== null) {
                addPointToPointsSet(intersectionPoints, lineIntersection);
            }
        }
    }
    return intersectionPoints.length >= 3 ? intersectionPoints : null;
}
/**
 * Internal helper for polygon operations to add a point to a path.
 *
 * Similar to `addPoint`, but specialized for polygon paths. It prevents adding a point
 * if it is identical to the *last added point* or the *first point* (to avoid degenerate segments or premature closing).
 *
 * @param points - The current list of polygon vertices.
 * @param point - The next vertex to add.
 * @returns `true` if the point was added, `false` if it was skipped.
 */
function addPointToPointsSet(points, point) {
    if (points.length > 0 && equalPoints(points[points.length - 1], point)) {
        return false;
    }
    if (points.length > 1 && equalPoints(points[0], point)) { // Check first point only if there are enough points
        return false;
    }
    points.push(point);
    return true;
}
/**
 * Checks if a point lies inside or on the boundary of a circle.
 *
 * @param point - The point to test.
 * @param center - The center point of the circle.
 * @param radius - The radius of the circle in pixels.
 * @returns `true` if the distance from the point to the center is less than or equal to the radius.
 */
function pointInCircle(point, center, radius) {
    return (point.x - center.x) * (point.x - center.x) + (point.y - center.y) * (point.y - center.y) <= radius * radius;
}
// #endregion
// #region Line Clipping & Extension (from V3.8 renderers/draw-line.ts)
/**
 * Extends a line segment infinitely in one or both directions and then clips it to a bounding box.
 *
 * This is the core logic for drawing Rays, Extended Lines, and Horizontal/Vertical lines
 * that must span across the visible chart area.
 *
 * @param point0 - The first control point.
 * @param point1 - The second control point (defines direction).
 * @param width - The width of the clipping area (0 to width).
 * @param height - The height of the clipping area (0 to height).
 * @param extendLeft - If `true`, the line extends infinitely past `point0`.
 * @param extendRight - If `true`, the line extends infinitely past `point1`.
 * @returns A {@link Segment} clipped to the box, a single {@link Point} if clipped to the edge, or `null` if the line misses the box entirely.
 */
function extendAndClipLineSegment(point0, point1, width, height, extendLeft, extendRight) {
    if (equalPoints(point0, point1)) {
        return null; // Degenerate segment
    }
    const topLeft = new Point(0, 0);
    const bottomRight = new Point(width, height);
    const clippingBox = new Box(topLeft, bottomRight);
    if (extendLeft) {
        if (extendRight) {
            // Extend infinitely in both directions and clip to box
            const lineThrough = lineThroughPoints(point0, point1);
            // --- Check for null return from lineThroughPoints ---
            if (lineThrough === null) {
                return null; // Fully degenerate line
            }
            const intersection = intersectLineAndBox(lineThrough, clippingBox);
            return intersection;
        }
        else {
            // Extend as a ray from point1 through point0 and clip to box
            const intersection = intersectRayAndBox(point1, point0, clippingBox);
            return intersection === null || equalPoints(point1, intersection) ? null : lineSegment(point1, intersection);
        }
    }
    if (extendRight) {
        // Extend as a ray from point0 through point1 and clip to box
        const intersection = intersectRayAndBox(point0, point1, clippingBox);
        return intersection === null || equalPoints(point0, intersection) ? null : lineSegment(point0, intersection);
    }
    else {
        // Just clip the segment itself to the box
        const intersection = intersectLineSegmentAndBox(lineSegment(point0, point1), clippingBox);
        return intersection;
    }
}
// #endregion
// #region Time/Logical Index Interpolation Utilities
/**
 * **Time Format Utility: String to Timestamp**
 *
 * Converts a standard ISO Date string (e.g., "2023-01-01") into a UNIX Timestamp (seconds).
 *
 * ### Context
 * Lightweight Charts supports data formats where time is a string (e.g., '2018-12-22').
 * However, the plugin's internal geometry and interpolation math ({@link interpolateTimeFromLogicalIndex})
 * strictly requires numeric values to calculate deltas and intervals.
 *
 * This helper ensures that string-based series data can be consumed by the math engine.
 *
 * @param dateString - The date string to convert.
 * @returns The timestamp in seconds (UTCTimestamp).
 */
function convertDateStringToUTCTimestamp(dateString) {
    const date = new Date(dateString);
    return Math.floor(date.getTime() / 1000);
}
/**
 * **Time Format Utility: Timestamp to String**
 *
 * Converts a numeric UNIX Timestamp back into a standard ISO Date string ("YYYY-MM-DD").
 *
 * ### Context
 * This is the inverse of {@link convertDateStringToUTCTimestamp}. It is used when the plugin
 * needs to return a time value that matches the format of the source series data.
 *
 * For example, if the chart is configured with string dates, {@link interpolateTimeFromLogicalIndex}
 * uses this to format its numeric result back into a string so the resulting point matches
 * the series' native data format.
 *
 * @param timestamp - The timestamp in seconds.
 * @returns The formatted date string.
 */
function convertUTCTimestampToDateString(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toISOString().split('T')[0];
}
/**
 * **Critical Core Utility: Time Extrapolation**
 *
 * Interpolates (or extrapolates) a precise Time value for a specific Logical Index, primarily to handle
 * coordinates in the chart's "blank space" (the future area where no data bars exist yet).
 *
 * ### The Problem it Solves
 * Native Lightweight Charts APIs (like `coordinateToTime`) often return `null` or snap to the nearest existing bar
 * when querying coordinates in the empty space to the right of the series. However, drawing tools (like Ray Lines
 * or Fibonacci Retracements) often need to project strictly into this future space.
 *
 * ### How it Works
 * 1. It samples the first two data points of the series to calculate the exact time interval (e.g., 1 day, 1 minute) between bars.
 * 2. It applies a linear extrapolation formula: `TargetTime = StartTime + (TargetLogicalIndex * TimeInterval)`.
 *
 * ### Interplay & Importance
 * * **Interaction:** This is the engine behind `InteractionManager`. When you move your mouse into the empty space,
 *   this function converts that screen position into a valid Timestamp, allowing the tool's "Ghost Point" to be drawn smoothly.
 * * **Inverse Operation:** Its counterpart is {@link interpolateLogicalIndexFromTime}, which maps these timestamps back to screen coordinates.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item (e.g., `UTCTimestamp`).
 * @param chart - The chart API instance.
 * @param series - The series API instance (required to sample data density/interval).
 * @param logicalIndex - The logical index (float) to convert into a time.
 * @returns The extrapolated `Time`, or `null` if the series has insufficient data ( < 2 bars) to determine an interval.
 */
function interpolateTimeFromLogicalIndex(chart, // NEW: Now accepts chart instance
series, // Keep series for data access
logicalIndex) {
    if (!chart || !series) { // Also check if chart is defined
        console.warn("[interpolateTimeFromLogicalIndex] chart or series is not defined.");
        return null;
    }
    const timeScale = chart.timeScale(); // Access timeScale directly from chart
    // Retrieve data for the first two points in the series to calculate the time interval.
    // This assumes that there are at least two data points to establish a reliable interval.
    // If the chart starts empty, this will need a fallback (e.g., using default bar spacing).
    const dataAtIndex0 = series.dataByIndex(0, 0);
    const dataAtIndex1 = series.dataByIndex(1, 0);
    if (!dataAtIndex0 || !dataAtIndex1) {
        // Fallback for very few data points: try to use visible logical range or timeScale options
        const visibleLogicalRange = timeScale.getVisibleLogicalRange();
        if (visibleLogicalRange && visibleLogicalRange.to - visibleLogicalRange.from > 0) {
            const logicalSpan = visibleLogicalRange.to - visibleLogicalRange.from;
            // Use coordinateToTime on the chart's time scale directly
            const timeFrom = timeScale.coordinateToTime(timeScale.logicalToCoordinate(visibleLogicalRange.from));
            const timeTo = timeScale.coordinateToTime(timeScale.logicalToCoordinate(visibleLogicalRange.to));
            if (timeFrom !== null && timeTo !== null && logicalSpan > 0) {
                const timeSpan = timeTo - timeFrom;
                const timePerLogicalUnit = timeSpan / logicalSpan;
                const logicalOffset = logicalIndex - visibleLogicalRange.from;
                return (timeFrom + logicalOffset * timePerLogicalUnit);
            }
        }
        console.warn("[interpolateTimeFromLogicalIndex] Not enough data points or visible range for interpolation. Cannot determine time.");
        // If we can't get a reliable interval, return null.
        return null;
    }
    // Use cached series data for accurate logical->time (handles weekend gaps)
    const cachedData2 = typeof window !== 'undefined' && window.__algSuiteSeriesData;
    if (cachedData2 && cachedData2.length >= 2) {
        const idx = Math.max(0, Math.min(Math.round(logicalIndex), cachedData2.length - 1));
        return cachedData2[idx].time;
    }
    const startTime = typeof dataAtIndex0.time === 'string'
        ? convertDateStringToUTCTimestamp(dataAtIndex0.time)
        : dataAtIndex0.time;
    const endTime = typeof dataAtIndex1.time === 'string'
        ? convertDateStringToUTCTimestamp(dataAtIndex1.time)
        : dataAtIndex1.time;
    const interval = (Number(endTime) - Number(startTime));
    const logicalDelta = logicalIndex - 0;
    const interpolatedTime = Number(startTime) + logicalDelta * interval;
    if (typeof dataAtIndex0.time === 'string') {
        return convertUTCTimestampToDateString(interpolatedTime);
    }
    else {
        return interpolatedTime;
    }
}
/**
 * **Critical Core Utility: Viewport & Culling Bounds**
 *
 * Calculates the *absolute* visible price range of the chart pane, mapping the physical top and bottom pixel
 * edges directly to price values.
 *
 * ### The Problem it Solves
 * The standard `priceScale.getVisiblePriceRange()` method often accounts for margins or auto-scaling logic,
 * which might imply the visible area is smaller than the actual canvas. For **Culling** (determining if a tool is off-screen)
 * and **Infinite Geometries** (drawing Vertical Lines or Rays), we need to know the exact price at pixel `0` (top)
 * and pixel `height` (bottom).
 *
 * ### Interplay & Importance
 * * **Culling:** This function provides the `minPrice` and `maxPrice` for the {@link ToolBoundingBox} used in `src/utils/culling-helpers.ts`.
 *   Without this, tools might disappear prematurely when scrolling.
 * * **Rendering:** It ensures that infinite lines are drawn strictly to the edge of the canvas, preventing visual artifacts or gaps.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 * @param tool - The tool instance (provides access to the Chart, Series, and Pane dimensions).
 * @returns An object containing `from` (bottom price) and `to` (top price), or `null` if the chart isn't ready.
 */
function getExtendedVisiblePriceRange(tool) {
    const chart = tool.getChart();
    const series = tool.getSeries();
    // 1. Get total widget height from the root element
    const totalHeight = chart.chartElement().clientHeight;
    // 2. Get the time scale height (this is the height of the whole time axis widget)
    // NOTE: We rely on the internal height property for the Time Scale widget.
    const timeScaleHeight = chart.timeScale().height() || 0;
    // 3. Calculate the Pane Drawing Height: Total Height - Time Axis Height
    // This value is what the coordinate system is based on (0 to PaneHeight).
    const paneHeight = totalHeight - timeScaleHeight;
    // 4. Calculate price range using the calculated pane height
    return {
        from: series.coordinateToPrice(paneHeight), // Price at bottom
        to: series.coordinateToPrice(0), // Price at top
    };
}
/**
 * **Critical Core Utility: Logical Index Recovery**
 *
 * Calculates the Logical Index for a specific Timestamp using linear extrapolation. This is the mathematical
 * inverse of {@link interpolateTimeFromLogicalIndex}.
 *
 * ### The Problem it Solves
 * When a drawing tool is saved and later reloaded, its definition contains raw Timestamps (e.g., "2025-01-01").
 * If that date is in the future (the "blank space"), the chart has no internal record of it.
 * The standard `timeScale.timeToCoordinate()` may fail or return `null` for these future dates.
 *
 * ### How it Works
 * It calculates the series' time interval (delta between bars) and determines how many "steps" (logical indices)
 * the target timestamp is away from a known anchor point (the first bar).
 *
 * ### Interplay & Importance
 * * **Rendering:** This is the backbone of `BaseLineTool.pointToScreenPoint()`. It allows the renderers to figure out
 *   exactly where on the X-axis (in pixels) a saved future timestamp should be drawn.
 * * **Accuracy:** By using the calculated interval, it ensures that tools drawn in the future align perfectly
 *   with the grid, preserving the visual continuity of the time scale.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 * @param chart - The chart API instance.
 * @param series - The series API instance (used to determine the time interval between bars).
 * @param timestamp - The target timestamp to convert.
 * @returns The calculated `Logical` index, or `null` if the series has insufficient data.
 */
function interpolateLogicalIndexFromTime(chart, series, timestamp) {
    if (!series) {
        console.warn("[interpolateLogicalIndexFromTime] series is not defined.");
        return null;
    }
    const givenTimeNum = typeof timestamp === 'string'
        ? convertDateStringToUTCTimestamp(timestamp)
        : Number(timestamp);
    // Use cached series data array for exact binary search (handles gaps correctly)
    const cachedData = typeof window !== 'undefined' && window.__algSuiteSeriesData;
    if (cachedData && cachedData.length >= 2) {
        let lo = 0, hi = cachedData.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (Number(cachedData[mid].time) <= givenTimeNum) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }
    // Fallback: linear interpolation with first two data points
    const dataAtIndex0 = series.dataByIndex(0, 0);
    const dataAtIndex1 = series.dataByIndex(1, 0);
    if (!dataAtIndex0 || !dataAtIndex1) return null;
    const time0 = typeof dataAtIndex0.time === 'string'
        ? convertDateStringToUTCTimestamp(dataAtIndex0.time)
        : dataAtIndex0.time;
    const time1 = typeof dataAtIndex1.time === 'string'
        ? convertDateStringToUTCTimestamp(dataAtIndex1.time)
        : dataAtIndex1.time;
    const interval = (Number(time1) - Number(time0));
    if (interval === 0) return null;
    const timeDiff = givenTimeNum - Number(time0);
    return timeDiff / interval;
}
// NOTE: The `interpolateLogicalIndexFromTime` function might also be useful for complex scenarios
// but is not strictly required for the immediate goal of "drawing in blank space" for creation.
// It could be added later if you need to convert an arbitrary timestamp (e.g., from a saved tool in blank space)
// back into a logical index for rendering purposes.
// #endregion Time/Logical Index Interpolation Utilities
// #region Text-related Geometry Helpers (from V3.8)
/**
 * Rotates a point around a specific pivot by a given angle.
 *
 * This is essential for rendering rotated text boxes and shapes.
 *
 * @param point - The point to rotate.
 * @param pivot - The center point of rotation.
 * @param angle - The rotation angle in radians (positive values rotate clockwise in canvas coordinates).
 * @returns A new {@link Point} representing the rotated position.
 */
function rotatePoint(point, pivot, angle) {
    if (angle === 0) {
        return point.clone();
    } // No rotation needed
    const x = (point.x - pivot.x) * Math.cos(angle) - (point.y - pivot.y) * Math.sin(angle) + pivot.x;
    const y = (point.x - pivot.x) * Math.sin(angle) + (point.y - pivot.y) * Math.cos(angle) + pivot.y;
    return new Point(x, y);
}
// #endregion Text-related Geometry Helpers

// /src/interaction/interaction-manager.ts
const DRAG_THRESHOLD = 10; // Pixels to classify movement as drag
const CLICK_TIMEOUT = 300; // Milliseconds (max time between down and up for a click)
/**
 * Manages all user interactions with line tools, including creation, selection,
 * editing, and event propagation. It acts as the central router for mouse
 * and touch events.
 */
class InteractionManager {
    /**
     * Initializes the Interaction Manager, setting up all internal references and subscribing
     * to necessary DOM and Lightweight Charts events.
     *
     * This class serves as the central event handler, converting low-level mouse and touch
     * events into logical interaction commands for line tools (e.g., drag, select, create).
     *
     * @param plugin - The root {@link LineToolsCorePlugin} instance for internal updates and event firing.
     * @param chart - The Lightweight Charts chart API instance.
     * @param series - The primary series API instance.
     * @param tools - The map of all registered line tools.
     * @param toolRegistry - The registry for looking up tool constructors.
     */
    constructor(plugin, chart, series, tools, toolRegistry) {
        // State Management
        this._currentToolCreating = null;
        this._selectedTool = null;
        this._hoveredTool = null;
        // Interaction State (Editing)
        this._isEditing = false;
        this._draggedTool = null;
        this._draggedPointIndex = null;
        this._originalDragPoints = null;
        this._dragStartPoint = null;
        // Store the cursor that started the interaction
        this._activeDragCursor = null;
        // Interaction State (Creation - Raw DOM Listeners)
        this._isCreationGesture = false;
        this._creationTool = null;
        this._mouseDownPoint = null;
        this._mouseDownTime = 0;
        this._isDrag = false;
        this._isShiftKeyDown = false;
        this._plugin = plugin;
        this._chart = chart;
        this._series = series;
        this._tools = tools;
        this._toolRegistry = toolRegistry;
        this._horzScaleBehavior = chart.horzBehaviour();
        this._subscribeToChartEvents();
    }
    /**
     * Converts raw screen coordinates (in pixels) to a logical {@link LineToolPoint} (timestamp/price).
     *
     * This conversion is robust, handling interpolation to return a time and price value
     * even if the screen point is over an area of the chart without a data bar (blank logical space).
     *
     * @param screenPoint - The screen coordinates as a {@link Point} object.
     * @returns A {@link LineToolPoint} containing a timestamp and price, or `null` if the conversion fails.
     *
     * @example
     * // Used by LineToolsCorePlugin to position the crosshair
     * const logicalPoint = manager.screenPointToLineToolPoint(new Point(x, y));
     */
    screenPointToLineToolPoint(screenPoint) {
        const timeScale = this._chart.timeScale();
        const price = this._series.coordinateToPrice(screenPoint.y);
        let logical = timeScale.coordinateToLogical(screenPoint.x);
        if (logical === null) {
            // Blank space to the right — extrapolate logical from visible range
            const visibleRange = timeScale.getVisibleLogicalRange();
            if (!visibleRange) return null;
            const width = timeScale.width ? timeScale.width() : 0;
            if (!width) return null;
            const logicalPerPixel = (visibleRange.to - visibleRange.from) / width;
            const leftCoord = timeScale.logicalToCoordinate(visibleRange.from);
            if (leftCoord === null) return null;
            logical = visibleRange.from + (screenPoint.x - leftCoord) * logicalPerPixel;
        }
        // Use utility function (which uses interpolation) to get a timestamp from the logical index.
        const interpolatedTime = interpolateTimeFromLogicalIndex(this._chart, this._series, logical);
        if (interpolatedTime === null || price === null) {
            return null;
        }
        // Return the final LineToolPoint (timestamp/price).
        return {
            timestamp: this._horzScaleBehavior.key(interpolatedTime),
            price: price,
        };
    }
    /**
     * Sets the specific tool instance that is currently being drawn interactively by the user.
     *
     * This is called by the {@link LineToolsCorePlugin.addLineTool} method when initiating an
     * interactive creation gesture. This tool instance becomes the target for subsequent mouse clicks.
     *
     * @param tool - The {@link BaseLineTool} instance currently in creation mode, or `null` to clear.
     * @internal
     */
    setCurrentToolCreating(tool) {
        this._currentToolCreating = tool;
        //console.log(`[InteractionManager] Set _currentToolCreating to ${tool?.id() || 'null'}`);
    }
    /**
     * Attaches a line tool primitive to the main series for rendering.
     *
     * This is an internal helper called by the {@link LineToolsCorePlugin} immediately after a tool is constructed.
     *
     * @param tool - The {@link BaseLineTool} to attach.
     * @private
     */
    attachTool(tool) {
        this._series.attachPrimitive(tool);
    }
    /**
     * Subscribes to all necessary browser DOM events (`mousedown`, `mousemove`, `mouseup`, `keydown`, `keyup`)
     * and Lightweight Charts API events (`subscribeDblClick`, `subscribeCrosshairMove`) to capture user input.
     *
     * @private
     */
    _subscribeToChartEvents() {
        const chartElement = this._chart.chartElement();
        // 1. Raw DOM Events for Drag/Click Detection and Editing
        chartElement.addEventListener('mousedown', this._handleMouseDown.bind(this));
        chartElement.addEventListener('mousemove', this._handleMouseMove.bind(this));
        window.addEventListener('mouseup', this._handleMouseUp.bind(this));
        // 2. LWC API Events for Ghosting/Hover/DBLClick
        this._chart.subscribeDblClick(this._handleDblClick.bind(this));
        this._chart.subscribeCrosshairMove(this._handleCrosshairMove.bind(this));
        // Global Listeners for Persistent Key State **
        window.addEventListener('keydown', this._handleKey.bind(this));
        window.addEventListener('keyup', this._handleKey.bind(this));
    }
    /**
     * Handles global `keydown` and `keyup` events, specifically tracking the state of the 'Shift' key.
     *
     * The Shift key state is critical for enabling constraint-based drawing (e.g., 45-degree angle locking).
     *
     * @param event - The browser's KeyboardEvent.
     * @private
     */
    _handleKey(event) {
        if (event.key === 'Shift') {
            const newState = event.type === 'keydown';
            // Only proceed if the state is actually changing
            if (this._isShiftKeyDown !== newState) {
                this._isShiftKeyDown = newState;
                // CRUCIAL: Only request update IF a tool is currently active/creating.
                // This prevents needless updates when the user is just typing on the page.
                if (this._currentToolCreating || this._selectedTool) ;
            }
        }
    }
    /**
     * Detaches a line tool primitive from the chart's rendering pipeline and cleans up all internal references to it.
     *
     * This method is called by the {@link LineToolsCorePlugin} when a tool is removed.
     *
     * @param tool - The {@link BaseLineTool} to detach and clean up.
     * @internal
     */
    detachTool(tool) {
        // 1. Remove from Lightweight Charts rendering pipeline (from its associated pane)
        try {
            tool.getPane().detachPrimitive(tool);
            console.log(`[InteractionManager] Detached primitive for tool: ${tool.id()} from pane.`);
        }
        catch (e) {
            console.error(`[InteractionManager] Error detaching primitive for tool ${tool.id()}:`, e.message);
        }
        // 2. Clear internal references if this tool was the one being tracked
        if (this._currentToolCreating === tool) {
            this._currentToolCreating = null;
        }
        if (this._selectedTool === tool) {
            this._selectedTool = null;
        }
        if (this._hoveredTool === tool) {
            this._hoveredTool = null;
        }
        // Reset interaction state if the removed tool was being dragged/edited
        if (this._draggedTool === tool || this._creationTool === tool) {
            this._isEditing = false;
            this._isCreationGesture = false;
            this._draggedTool = null;
            this._creationTool = null;
            this._draggedPointIndex = null;
            this._mouseDownPoint = null;
            this._mouseDownTime = 0;
            this._isDrag = false;
            // Re-enable chart's handleScroll if it was disabled for dragging
            this._chart.applyOptions({
                handleScroll: {
                    pressedMouseMove: true,
                },
            });
        }
    }
    /**
     * Finalizes the interactive creation of a tool once its required number of points have been placed.
     *
     * This method performs state cleanup, deselects all other tools, selects the new tool,
     * calls the tool's optional `normalize()` method, and fires the `afterEdit` event.
     *
     * @param tool - The {@link BaseLineTool} that has completed its creation.
     * @private
     */
    _finalizeToolCreation(tool) {
        tool.tryFinish();
        // Ensure the tool's ghost point is cleared, regardless of finalization method
        tool.clearGhostPoint();
        this._plugin.fireAfterEditEvent(tool, 'lineToolFinished');
        this.deselectAllTools();
        this._selectedTool = tool;
        this._selectedTool.setSelected(true);
        // --- NEW FIX: Call normalize() if implemented by the tool ---
        const toolWithNormalize = tool;
        if (toolWithNormalize.normalize) {
            toolWithNormalize.normalize();
            console.log(`[InteractionManager] Normalized tool after creation: ${tool.id()}`);
        }
        // --- END NEW FIX ---
        // Reset creation-related state
        this._isCreationGesture = false;
        this._creationTool = null;
        this._isDrag = false;
        this._mouseDownPoint = null;
        this._mouseDownTime = 0;
        this.setCurrentToolCreating(null);
        this._chart.applyOptions({ handleScroll: { pressedMouseMove: true } });
        this._plugin.requestUpdate();
        console.log(`[InteractionManager] Tool creation finalized: ${tool.id()}`);
    }
    /**
     * Handles the initial `mousedown` event on the chart canvas.
     *
     * This is the crucial entry point for an interaction gesture, determining if the action is:
     * 1. The start of an interactive tool creation.
     * 2. The start of a drag/edit gesture on an existing tool (dragged anchor or body).
     * 3. An initial click that leads to selection.
     *
     * @param event - The browser's MouseEvent.
     * @private
     */
    _handleMouseDown(event) {
        const point = this._eventToPoint(event);
        if (!point) {
            return;
        }
        // Reset drag/click state
        this._isDrag = false;
        this._mouseDownPoint = point;
        this._mouseDownTime = performance.now();
        // --- 1. Tool Creation START/CONTINUATION ---
        if (this._currentToolCreating) {
            this._creationTool = this._currentToolCreating; // The tool instance must exist here
            this._isCreationGesture = true;
            // Immediately disable chart scroll as we've captured the gesture
            this._chart.applyOptions({ handleScroll: { pressedMouseMove: false } });
            console.log(`[InteractionManager] Creation gesture started for ${this._creationTool.id()}`);
            // Since the logic for 1-point tools is now in MouseUp, we just return here.
            return;
        }
        // --- 2. GESTURE ON EXISTING TOOL START ---
        const hitResult = this._hitTest(point);
        if (hitResult && hitResult.tool) {
            if (!hitResult.tool.options().editable) {
                return;
            }
            // A detected hit means this tool must be selected immediately.
            if (!hitResult.tool.isSelected()) {
                this.deselectAllTools();
                this._selectedTool = hitResult.tool;
                this._selectedTool.setSelected(true);
            }
            this._draggedTool = hitResult.tool;
            this._draggedPointIndex = hitResult.pointIndex;
            // Smart Cursor Logic
            // 1. Get the cursor suggested by the renderer (e.g., 'nwse-resize' or 'pointer')
            let capturedCursor = hitResult.suggestedCursor || PaneCursorType.Default;
            // LOG 1: What did the hit test suggest initially?
            //console.log('[Debug] Hit Suggested:', capturedCursor);
            // 2. "Smart Upgrade": If the renderer says "Pointer" (generic hover) or "Default", 
            //    but we are initiating a drag on a tool, upgrade it to the tool's Drag Cursor (Grabbing).
            //    We DO NOT upgrade if it's a specific resize cursor (e.g., 'nwse-resize').
            if (capturedCursor === PaneCursorType.Pointer || capturedCursor === PaneCursorType.Default) {
                const toolDragCursor = hitResult.tool.options().defaultDragCursor;
                // LOG 2: What is the tool's configured drag cursor?
                //console.log('[Debug] Tool Default Drag:', toolDragCursor);
                capturedCursor = toolDragCursor || PaneCursorType.Grabbing;
            }
            // 3. Lock this cursor for the duration of the drag
            this._activeDragCursor = capturedCursor;
            let allOriginalPoints = [];
            // If tool is Unbounded (Brush) AND a move is initiated (anchor drag OR background drag)
            // we must capture ALL permanent points for a full path translation.
            if (this._draggedTool.pointsCount === -1) {
                // Captures the full path for translation
                allOriginalPoints = this._draggedTool.getPermanentPointsForTranslation();
                // CRITICAL: We must clear the draggedPointIndex if the hit was on the center anchor
                // to ensure _handleMouseMove enters the correct Translate logic.
                // For Brush, index 0 is the center anchor, which should only ever move the tool.
                if (this._draggedTool.anchor0TriggersTranslation() && this._draggedPointIndex === 0) {
                    this._draggedPointIndex = null;
                }
            }
            else {
                // --- Standard Handling for Bounded Tools ---
                // Determine the maximum anchor index to iterate up to.
                const maxAnchorIndex = hitResult.tool.maxAnchorIndex
                    ? hitResult.tool.maxAnchorIndex()
                    : hitResult.tool.pointsCount - 1;
                const originalPointsArray = [];
                for (let i = 0; i <= maxAnchorIndex; i++) {
                    // Calls tool.getPoint(i), which calculates virtual points for indices > 1
                    originalPointsArray.push(hitResult.tool.getPoint(i));
                }
                // Filter out nulls and store the collected points
                allOriginalPoints = originalPointsArray.filter(p => p !== null);
            }
            // Store the collected points for drag comparison
            this._originalDragPoints = allOriginalPoints;
            // highlight-end
            this._dragStartPoint = point;
            this._chart.applyOptions({ handleScroll: { pressedMouseMove: false } });
            console.log(`[InteractionManager] Mouse Down: Starting gesture on tool ${hitResult.tool.id()}`);
        }
    }
    /**
     * Handles the `mousemove` event, which primarily manages dragging/editing or ghost-point drawing.
     *
     * This logic handles:
     * 1. Applying drag/edit updates to a selected tool's points, including calculating **Shift-key constraints**.
     * 2. Translating the entire tool if the drag started on the body.
     * 3. Updating the "ghost" point of a tool currently in `Creation` phase.
     * 4. Applying the correct custom cursor style during the drag.
     *
     * @param event - The browser's MouseEvent.
     * @private
     */
    _handleMouseMove(event) {
        const point = this._eventToPoint(event);
        if (!point) {
            return;
        }
        // --- 1. Check for Drag Threshold (If any gesture is active) ---
        if (this._isCreationGesture || this._draggedTool) {
            if (this._mouseDownPoint && point.subtract(this._mouseDownPoint).length() > DRAG_THRESHOLD) {
                this._isDrag = true; // Drag threshold met
            }
        }
        // --- 2. Creation Drag/Ghosting Flow (Single-Drag Creation) ---
        if (this._isCreationGesture && this._creationTool && this._mouseDownPoint) {
            const tool = this._creationTool;
            // Check if the tool supports drag creation AND the constraint is supported
            const isDragCreationSupported = tool.supportsClickDragCreation?.() === true;
            const isShiftConstraintSupported = tool.supportsShiftClickDragConstraint?.() === true;
            // Safety check: If not supported, rely on _handleCrosshairMove for ghosting and exit
            if (!isDragCreationSupported && !this._isDrag) {
                return;
            }
            if (this._isDrag && isDragCreationSupported) {
                const p0LocationLogical = this.screenPointToLineToolPoint(this._mouseDownPoint);
                let constrainedScreenPoint = point;
                // ADDED: Variable to capture the axis hint
                let snapAxis = 'none';
                // --- SHIFT CONSTRAINT LOGIC FOR CREATION DRAG (P1 is being placed) ---
                if (this._isShiftKeyDown && isShiftConstraintSupported) {
                    const anchorIndexBeingDragged = 1; // Always P1 during the first drag creation
                    const phase = InteractionPhase.Creation;
                    // P0's original position is the original logical point in this context
                    const originalP0 = p0LocationLogical;
                    if (originalP0 && tool.getShiftConstrainedPoint) {
                        // The logical points array is either empty or contains just P0 at this moment
                        const allOriginalLogicalPointsForCreation = this._originalDragPoints || (originalP0 ? [originalP0] : []);
                        const constraintResult = tool.getShiftConstrainedPoint(anchorIndexBeingDragged, point, phase, originalP0, // P0's original position is the constraint source
                        allOriginalLogicalPointsForCreation);
                        constrainedScreenPoint = constraintResult.point;
                        snapAxis = constraintResult.snapAxis;
                    }
                }
                // Use the (potentially) constrained screen point for the logical conversion
                let constrainedLogicalPoint = this.screenPointToLineToolPoint(constrainedScreenPoint);
                // --- SYNCHRONOUS LOGICAL SNAP (APPLIED CONTINUOUSLY DURING DRAG) ---
                if (constrainedLogicalPoint && snapAxis !== 'none') {
                    const P0 = p0LocationLogical; // P0 is the point at the start of the drag
                    if (P0) {
                        if (snapAxis === 'time') {
                            constrainedLogicalPoint = {
                                timestamp: P0.timestamp,
                                price: constrainedLogicalPoint.price,
                            };
                        }
                        else if (snapAxis === 'price') {
                            constrainedLogicalPoint = {
                                timestamp: constrainedLogicalPoint.timestamp,
                                price: P0.price,
                            };
                        }
                    }
                }
                // --- END SYNCHRONOUS LOGICAL SNAP ---
                if (p0LocationLogical && constrainedLogicalPoint) {
                    tool.points();
                    if (tool.pointsCount === -1) {
                        // --- FREEHAND TOOL LOGIC (Brush/Highlighter) ---
                        // This tool is unbounded, so we call addPoint() continuously
                        tool.addPoint(constrainedLogicalPoint);
                    }
                    else {
                        if (tool.points().length === 0) {
                            // First time drag is detected, add both points
                            tool.addPoint(p0LocationLogical); // Commit P0 permanently at mousedown location
                            tool.addPoint(constrainedLogicalPoint); // Add P1 (to be updated/ghosted)
                        }
                        else if (tool.points().length === 2) {
                            // Already dragging, update P1
                            tool.setPoint(1, constrainedLogicalPoint);
                        }
                    }
                }
            }
            this._creationTool.updateAllViews();
            this._plugin.requestUpdate();
            return;
        }
        // --- 3. Editing Drag Flow (Final Logic for Shift Constraint) ---
        if (this._draggedTool && this._dragStartPoint) {
            // Check if the overall gesture has exceeded the drag threshold
            if (this._isDrag) {
                this._isEditing = true;
                // Lock the cursor to whatever we captured in MouseDown
                if (this._activeDragCursor) {
                    this._draggedTool.setOverrideCursor(this._activeDragCursor);
                }
            }
            if (this._isEditing) {
                const tool = this._draggedTool;
                const isAnchorDrag = this._draggedPointIndex !== null;
                // Phase is used for the Model's getShiftConstrainedPoint logic
                const phase = isAnchorDrag ? InteractionPhase.Editing : InteractionPhase.Move;
                // --- Bug 1 Fix: Check if an Anchor Drag should be treated as a Translate ---
                //let shouldTranslateInsteadOfReshape = false;
                //if (isAnchorDrag && tool.pointsCount === -1 && this._draggedPointIndex === 0) {
                // Condition: Anchor drag on an unbounded tool's first (and only visible) anchor (index 0)
                //	shouldTranslateInsteadOfReshape = true;
                //}
                // --- Anchor Drag Logic (Resizing) ---
                if (isAnchorDrag) {
                    const anchorIndex = ensureNotNull(this._draggedPointIndex);
                    // --- Determine the Screen Point: Raw Mouse OR Shift-Constrained ---
                    let constrainedScreenPoint = point;
                    // Apply Shift Constraint (This is where the N/S, E/W lock logic is applied)
                    if (this._isShiftKeyDown) {
                        const originalLogicalPoint = this._originalDragPoints[anchorIndex];
                        if (originalLogicalPoint && tool.getShiftConstrainedPoint) {
                            const constraintResult = tool.getShiftConstrainedPoint(// <<< CHANGE 3: Capture ConstraintResult
                            anchorIndex, point, phase, originalLogicalPoint, this._originalDragPoints);
                            constrainedScreenPoint = constraintResult.point;
                        }
                    }
                    // FINAL STEP: Convert the (potentially) constrained screen point to a fully snapped logical point
                    const targetLogicalPoint = this.screenPointToLineToolPoint(constrainedScreenPoint);
                    // Final update call
                    if (targetLogicalPoint) {
                        tool.setPoint(anchorIndex, targetLogicalPoint);
                    }
                }
                else {
                    // --- Tool Translate Logic (Move Phase) ---
                    if (!this._originalDragPoints || this._originalDragPoints.length === 0)
                        return;
                    // Calculate new screen points based on delta
                    const delta = point.subtract(this._dragStartPoint);
                    // highlight-start
                    // --- FIX for Stable Logical Translation Vector ---
                    const tool = this._draggedTool;
                    // 1. Get the Initial Logical P0 and Initial Screen Point
                    // We must use the point at which the drag initiated to calculate the vector
                    const initialLogicalP0 = this._originalDragPoints[0]; // The logical P0 at the moment of click
                    const initialScreenP0 = tool.pointToScreenPoint(initialLogicalP0); // The screen P0 at the moment of click
                    // If we cannot resolve the starting screen point, something is wrong.
                    if (!initialScreenP0)
                        return;
                    // 2. Calculate the intended New Screen Point for P0
                    // This is simply the initial P0 screen position + the cumulative pixel delta
                    const newScreenP0 = initialScreenP0.add(delta);
                    // 3. Convert the intended new Screen Point back to a Logical Point
                    const newLogicalP0 = tool.screenPointToPoint(newScreenP0);
                    if (!newLogicalP0) {
                        console.warn(`[InteractionManager] Failed to determine new logical P0.`);
                        return;
                    }
                    // 4. Calculate the Stable Translation Vector in Logical Space (Time and Price)
                    // This vector is the difference between the intended P0 and the original P0.
                    const timeTranslationVector = newLogicalP0.timestamp - initialLogicalP0.timestamp;
                    const priceTranslationVector = newLogicalP0.price - initialLogicalP0.price;
                    const newLogicalPoints = [];
                    // 5. Apply the Stable Translation Vector to all original points.
                    for (const originalLogicalPoint of this._originalDragPoints) {
                        const translatedLogicalPoint = {
                            // Apply the stable logical vectors
                            timestamp: originalLogicalPoint.timestamp + timeTranslationVector,
                            price: originalLogicalPoint.price + priceTranslationVector,
                        };
                        newLogicalPoints.push(translatedLogicalPoint);
                    }
                    // 6. Update the tool with the full array of new translated points
                    tool.setPoints(newLogicalPoints);
                }
                this._draggedTool.updateAllViews();
                this._plugin.requestUpdate();
            }
        }
    }
    /**
     * Handles the `mouseup` event, finalizing any active interaction (creation or editing).
     *
     * This method is responsible for:
     * 1. Committing the final point in a click-click creation sequence.
     * 2. Finalizing a drag-based creation (e.g., Rectangle, Brush).
     * 3. Finalizing an editing drag (resizing or translation) and resetting the editing state.
     * 4. Handling standalone clicks for selection/deselection.
     *
     * @param event - The browser's MouseEvent.
     * @private
     */
    _handleMouseUp(event) {
        const point = this._eventToPoint(event);
        // Early exit if mouseup is outside chart and not part of an ongoing drag
        const chartElement = this._chart.chartElement();
        const clickedInsideChartElement = chartElement.contains(event.target);
        // If mouseup occurred outside the chart's element, AND we're NOT currently dragging a tool
        // (either for creation or editing), then this mouseup is irrelevant to our chart interaction logic.
        if (!clickedInsideChartElement && !this._isDrag && !this._isCreationGesture && !this._draggedTool) {
            // A true "mouseup" on an external button or element that doesn't affect active chart interactions.
            this._resetCommonGestureState(); // Clear _mouseDownPoint etc.
            return;
        }
        // Flag to indicate if a specific interaction flow was handled.
        let handledInteraction = false;
        // --- 1. Finalize Creation Click/Drag ---
        if (this._isCreationGesture && this._creationTool && this._mouseDownPoint) {
            handledInteraction = true; // Mark as handled
            const tool = this._creationTool;
            const timeDelta = performance.now() - this._mouseDownTime;
            const distanceMoved = point ? point.subtract(this._mouseDownPoint).length() : 0;
            // Determine finalization method once
            const finalizationMethod = tool.getFinalizationMethod();
            const endPoint = point || this._mouseDownPoint;
            // Start with the raw screen point
            let finalScreenPoint = endPoint;
            let isDiscreteClick = timeDelta < CLICK_TIMEOUT && distanceMoved <= DRAG_THRESHOLD && !this._isDrag;
            //console.log('isDiscreteClick', isDiscreteClick)
            // --- 1-POINT TOOLS ---
            if (tool.pointsCount === 1) {
                // For a 1-point tool, the first MouseUp event is the final action.
                // 1. Get the final logical point for the click location
                const finalScreenPoint = endPoint;
                const finalLogicalPoint = this.screenPointToLineToolPoint(finalScreenPoint);
                if (finalLogicalPoint) {
                    // 2. Add the single permanent point
                    tool.addPoint(finalLogicalPoint);
                    // 3. Finalize and clean up
                    this._finalizeToolCreation(tool);
                    // Exit the function here: tool creation complete
                    return;
                }
                else {
                    // Point conversion failed (e.g., clicked far off-screen). Cancel creation.
                    this.detachTool(tool);
                    this._tools.delete(tool.id());
                    this.setCurrentToolCreating(null);
                    this._resetCreationGestureStateOnly();
                    return;
                }
            }
            // Downgrade Accidental Drag to Click for fixed-point tools placing a subsequent point.
            if (this._creationTool && !isDiscreteClick) {
                const tool = this._creationTool;
                const permanentPointsCount = tool.getPermanentPointsCount();
                const isFixedPointTool = tool.pointsCount > 0;
                // Downgrade if it's a fixed-point tool placing Point 2, 3, etc. OR if it's a click-only tool (Path)
                const isSubsequentPointOfFixedTool = isFixedPointTool && permanentPointsCount > 0;
                // this will also downgrade the path tool as well since tool.supportsClickDragCreation = false for that
                if (isSubsequentPointOfFixedTool || tool.supportsClickDragCreation?.() === false) {
                    // We override the drag state to false. This forces the upcoming check for 
                    // "isDiscreteClick" to evaluate as true, effectively treating the quick drag as a point click.
                    isDiscreteClick = true;
                    console.log(`[InteractionManager] Downgrade: Drag treated as discrete click to add point ${permanentPointsCount + 1}.`);
                }
            }
            // Check creation method preferences
            const supportsClickClick = tool.supportsClickClickCreation?.() !== false;
            const supportsClickDrag = tool.supportsClickDragCreation?.() === true;
            if (finalizationMethod === FinalizationMethod.MouseUp) {
                // --- Freehand (Brush/Highlighter) Finalization Logic ---
                // Tool creation is handled on MouseUp if it supports Drag Creation
                if (supportsClickDrag) {
                    // Finalize only if at least two points were drawn (P0 + P1 or more)
                    if (tool.getPermanentPointsCount() >= 2) {
                        this._finalizeToolCreation(tool);
                    }
                    else {
                        // If user just clicks and releases quickly without dragging, treat as failed creation
                        this.detachTool(tool);
                        this._tools.delete(tool.id());
                    }
                    this._resetCreationGestureStateOnly();
                    return;
                }
            }
            if (isDiscreteClick) {
                // Case A: Discrete Click (Click-Click Mode)
                if (!supportsClickClick) {
                    console.warn(`[InteractionManager] Tool ${tool.toolType} does not support click-click creation.`);
                    this.setCurrentToolCreating(null);
                    this.deselectAllTools();
                    this._plugin.requestUpdate();
                    this._resetCreationGestureStateOnly();
                    return;
                }
                // --- SHIFT CONSTRAINT LOGIC FOR DISCRETE CLICK FINALIZATION ---
                const isShiftKeyDown = this._isShiftKeyDown;
                const isShiftConstraintSupported = tool.supportsShiftClickClickConstraint?.() === true;
                // VARIABLE TO CAPTURE HINT
                let snapAxis = 'none';
                if (isShiftKeyDown && isShiftConstraintSupported) {
                    // Determine the index of the point that is *about to be added* (P1 if P0 exists)
                    const anchorIndexBeingAdded = tool.getPermanentPointsCount();
                    // The constraint source point is always P0 (index 0)
                    const anchorIndexUsedForConstraint = 0;
                    // Retrieve the original Logical P0 point for the constraint calculation
                    const originalLogicalPoint = tool.getPoint(anchorIndexUsedForConstraint);
                    // We need a safe points array to pass to the method
                    const allOriginalLogicalPoints = [originalLogicalPoint];
                    if (originalLogicalPoint && tool.getShiftConstrainedPoint) {
                        // Call the method returning ConstraintResult
                        const constraintResult = tool.getShiftConstrainedPoint(anchorIndexBeingAdded, endPoint, // Pass the raw mouse point
                        InteractionPhase.Creation, originalLogicalPoint, // P0's original position
                        allOriginalLogicalPoints);
                        // 1. Get the constrained SCREEN point
                        finalScreenPoint = constraintResult.point;
                        // 2. CAPTURE HINT
                        snapAxis = constraintResult.snapAxis;
                    }
                }
                // --- END SHIFT CONSTRAINT LOGIC ---
                // --- START SYNCHRONOUS LOGICAL SNAP FIX ---
                // 1. Convert the (potentially) constrained screen point into a logical point
                let finalLogicalPoint = this.screenPointToLineToolPoint(finalScreenPoint);
                console.log('finalLogicalPoint after let', JSON.parse(JSON.stringify(finalLogicalPoint)));
                // Check if we are placing P1 (point index 1) which is where the constraint applies
                const isP1Click = tool.getPermanentPointsCount() === 1;
                if (finalLogicalPoint && isP1Click && snapAxis !== 'none') {
                    // Clear ghost point since we are committing a snapped point
                    tool.setLastPoint(null);
                    const P0 = tool.getPoint(0);
                    // Synchronously perform the final logical snap based on the hint
                    if (P0) {
                        if (snapAxis === 'time') {
                            // X-axis snap (Time) - Overwrite the interpolated time with the reference time
                            finalLogicalPoint = {
                                timestamp: P0.timestamp,
                                price: finalLogicalPoint.price, // Keep the interpolated price
                            };
                        }
                        else if (snapAxis === 'price') {
                            // Y-axis snap (Price) - Overwrite the interpolated price with the reference price
                            finalLogicalPoint = {
                                timestamp: finalLogicalPoint.timestamp, // Keep the interpolated time
                                price: P0.price,
                            };
                        }
                    }
                }
                else {
                    // If no snap needed (P0 or unconstrained P1), clear the ghost point
                    if (finalLogicalPoint) {
                        tool.setLastPoint(null);
                    }
                }
                // --- END SYNCHRONOUS LOGICAL SNAP FIX ---
                // Case A: Discrete Click (Click-Click Mode)
                //GOTCHA i suspect that since the ghost creation of a tool for point1 (then 2nd point) actually modifies _points.
                //meaning the ghost does inject the ghost point into _points index 1 (2nd entry), so if we then tool.addPoint, then the constrained point
                // would be actually index 2 (3rd entry) in _points which is not what we want.
                console.log('finalLogicalPoint before if statement', JSON.parse(JSON.stringify(finalLogicalPoint)));
                if (finalLogicalPoint) {
                    tool.addPoint(finalLogicalPoint);
                }
                else {
                    console.warn(`[InteractionManager] Final logical point conversion failed. Click discarded.`);
                }
                if (finalizationMethod === FinalizationMethod.PointCount && tool.isFinished()) {
                    this._finalizeToolCreation(tool);
                    // --- FIX: Return immediately after finalization ---
                    return;
                }
                else {
                    console.log(`[InteractionManager] Click-Click: Placed Point ${tool.points().length}. Waiting for next point.`);
                }
            }
            else if (this._isDrag) {
                // Case B: Commit Click-and-Drag Creation
                if (!supportsClickDrag) {
                    console.warn(`[InteractionManager] Tool ${tool.toolType} does not support click-drag creation.`);
                    this.setCurrentToolCreating(null);
                    this.deselectAllTools();
                    this._plugin.requestUpdate();
                    this._resetCreationGestureStateOnly();
                    return;
                }
                // The point logic is handled inside _handleMouseMove/drag, which commits the points.
                // We just need to check if the final state is 'finished'.
                // Finalization for Bounded Drag Tools (e.g., Rectangle)
                if (finalizationMethod === FinalizationMethod.PointCount && tool.pointsCount === 2) {
                    if (tool.points().length === 2) {
                        this._finalizeToolCreation(tool);
                        return;
                    }
                }
            }
            // Always reset gesture-specific flags after a creation mouseup
            this._resetCreationGestureStateOnly();
            return; // Handled creation flow
        }
        // --- 2. Finalize Editing Click/Drag ---
        if (this._draggedTool && this._dragStartPoint) {
            if (this._isEditing) { // It was an EDITING DRAG
                console.log(`[InteractionManager] Mouse Up after edit drag: Finalizing for tool ${this._draggedTool.id()}`);
                this._plugin.fireAfterEditEvent(this._draggedTool, 'lineToolEdited');
                const tool = this._draggedTool;
                if (tool.normalize) {
                    tool.normalize();
                }
            }
            else { // It was a discrete CLICK ON AN EXISTING TOOL (selection)
                console.log(`[InteractionManager] Mouse Up: Discrete click on existing tool ${this._draggedTool.id()}. Attempting selection.`);
                this._handleStandaloneClick(this._dragStartPoint);
            }
            // Always reset editing-specific flags after an editing mouseup
            this._resetEditingGestureStateOnly();
            return; // Handled editing flow
        }
        // --- 3. Standalone Click (in empty space or on external UI) ---
        // This block is reached ONLY if no creation or editing gesture was active.
        const timeDeltaFinal = performance.now() - this._mouseDownTime;
        const distanceMovedFinal = this._mouseDownPoint && point ? point.subtract(this._mouseDownPoint).length() : 0;
        // This handles short clicks. Long clicks (non-drag, non-create, non-edit) also fall through here.
        // If it's a short click, we need to decide if it was on the chart.
        const wasAShortClick = (timeDeltaFinal < CLICK_TIMEOUT && distanceMovedFinal <= DRAG_THRESHOLD && point);
        if (wasAShortClick) {
            const chartElement = this._chart.chartElement();
            const clickedInsideChartElement = chartElement.contains(event.target);
            if (clickedInsideChartElement) {
                handledInteraction = true; // Mark as handled because it's a valid click *inside* the chart
                this._handleStandaloneClick(point);
            }
            else {
                // Click outside chart. We consider it handled in the sense that we decided to ignore it.
                handledInteraction = true; // Still marked as handled for the purpose of the final fallback reset
            }
        }
        else {
            // This was a drag that fell through creation/editing. Likely a drag in empty space.
            // Such a drag should typically deselect.
            if (this._isDrag) { // If it was a drag gesture
                handledInteraction = true;
                this.deselectAllTools();
                this._plugin.requestUpdate();
            }
        }
        // --- Final Fallback Reset ---
        // This ensures all interaction state is cleared if the mouseup wasn't part of any recognized gesture,
        // and it shouldn't clear _currentToolCreating if a multi-point tool is awaiting its next point.
        if (!handledInteraction) {
            this._resetInteractionStateFully(); // This version clears everything safely.
        }
        else {
            // Even if an interaction was handled, we need to clear common gesture state
            this._resetCommonGestureState();
        }
    }
    /**
     * Clears flags related only to a one-time mouse gesture (drag state, mouse position/time).
     *
     * This is used during multi-point creation to reset the interaction flags *without* ending the
     * overall `_currentToolCreating` process.
     *
     * @private
     */
    _resetCreationGestureStateOnly() {
        this._isDrag = false;
        this._mouseDownPoint = null;
        this._mouseDownTime = 0;
        this._isCreationGesture = false;
        // IMPORTANT: Does NOT touch _currentToolCreating or _activeTool
    }
    /**
     * Clears flags and state related to an active tool editing/dragging session.
     *
     * This includes clearing the dragged tool reference, clearing the cursor override, and
     * re-enabling the chart's built-in scroll/pan functionality.
     *
     * @private
     */
    _resetEditingGestureStateOnly() {
        // Clear Override
        // Important: Clear the override BEFORE nulling _draggedTool
        if (this._draggedTool) {
            this._draggedTool.setOverrideCursor(null);
        }
        // Clear the stored cursor state so the next click starts fresh
        this._activeDragCursor = null;
        this._isEditing = false;
        this._draggedTool = null;
        this._draggedPointIndex = null;
        this._dragStartPoint = null;
        this._originalDragPoints = null;
        this._chart.applyOptions({ handleScroll: { pressedMouseMove: true } });
    }
    /**
     * Clears the most fundamental mouse gesture state variables: drag flag, mouse down point, and time.
     *
     * @private
     */
    _resetCommonGestureState() {
        this._isDrag = false;
        this._mouseDownPoint = null;
        this._mouseDownTime = 0;
    }
    /**
     * Performs a complete reset of all interaction state flags, including clearing the tool in creation,
     * deselecting all tools, and requesting a chart update.
     *
     * This is typically used as a fallback for unhandled interactions or external API calls (e.g., context menus).
     *
     * @private
     */
    _resetInteractionStateFully() {
        this._resetCreationGestureStateOnly();
        this._resetEditingGestureStateOnly();
        this.setCurrentToolCreating(null); // This also sets _activeTool = null
        this.deselectAllTools(); // Ensures no tool remains selected
        this._plugin.requestUpdate();
    }
    /**
     * Processes a discrete click that occurred outside of an active creation or editing gesture.
     *
     * This logic handles selection: if a tool was clicked, it becomes selected; otherwise, all tools are deselected.
     *
     * @param point - The screen coordinates of the click event.
     * @private
     */
    _handleStandaloneClick(point) {
        const clickedTool = point ? this._hitTest(point)?.tool : null;
        if (clickedTool) {
            if (this._selectedTool === clickedTool)
                return;
            this.deselectAllTools();
            this._selectedTool = clickedTool;
            this._selectedTool.setSelected(true);
        }
        else {
            this.deselectAllTools();
        }
    }
    /**
     * Handles the chart's double-click event broadcast.
     *
     * This method checks for two conditions:
     * 1. **Creation Finalization:** Ends the drawing process for tools that use `FinalizationMethod.DoubleClick` (e.g., Path tool).
     * 2. **Event Firing:** Triggers the public `fireDoubleClickEvent` if an existing tool was hit.
     *
     * @param params - The event parameters provided by Lightweight Charts.
     * @private
     */
    _handleDblClick(params) {
        const point = params.point ? new Point(params.point.x, params.point.y) : null;
        if (!point)
            return;
        // --- 1. Tool Creation Finalization (Path Tool Logic) ---
        // Future Path Tool Logic: End creation on DBLCLICK
        if (this._currentToolCreating) {
            const tool = this._currentToolCreating;
            if (tool.getFinalizationMethod() === FinalizationMethod.DoubleClick) {
                // Tool creation is complete on double-click
                if (tool.getPermanentPointsCount() > 0) {
                    // Allow the tool to perform its finalization cleanup (e.g., removing the rogue point)
                    tool.handleDoubleClickFinalization();
                    this._finalizeToolCreation(tool);
                    // Reset the creation state after finalization
                    this._resetCreationGestureStateOnly();
                }
                else {
                    // If a tool using DoubleClick finalization had no points placed, 
                    // treat it as a cancelled creation.
                    this.detachTool(tool);
                    this._tools.delete(tool.id());
                    this.setCurrentToolCreating(null);
                }
                return;
            }
        }
        // --- 2. Hover/Hit Test Logic (Existing Tool Logic) ---
        const hitResult = this._hitTest(point);
        if (hitResult && hitResult.tool) {
            this._plugin.fireDoubleClickEvent(hitResult.tool);
        }
    }
    /**
     * Handles the chart's crosshair move event, used for hover state and ghost-point drawing.
     *
     * This method:
     * 1. Manages the visual state of the tool currently being created (the "ghosting" point), applying Shift-key constraints.
     * 2. Updates the `_hoveredTool` property and sets its hover state, allowing views to draw hover effects.
     *
     * @param params - The event parameters provided by Lightweight Charts.
     * @private
     */
    _handleCrosshairMove(params) {
        // --- Ghosting Logic ---
        const toolBeingCreated = this._currentToolCreating;
        if (toolBeingCreated) {
            const rawScreenPoint = params.point ? new Point(params.point.x, params.point.y) : null;
            // --- Single-Point Tool Ghosting (Pre-Click Ghosting) ---
            if (rawScreenPoint && toolBeingCreated.pointsCount === 1) {
                // Single point tools are immediately completed on the first click.
                // We use setLastPoint to visualize the *final* tool location pre-click.
                const logicalPoint = this.screenPointToLineToolPoint(rawScreenPoint);
                if (logicalPoint) {
                    toolBeingCreated.setLastPoint(logicalPoint);
                    this._plugin.requestUpdate();
                }
                // We SKIP the complex multi-point ghosting and constraint logic below.
                return;
            }
            // GOTCHA if i used the crosshair subscribe via sourceEvent , TouchMouseEventData, shiftKey it is spotty
            // it will only sometime show shift is true, so i use true browser events to get a reliable stream of shift data
            const isShiftKeyDown = this._isShiftKeyDown;
            let finalScreenPoint = rawScreenPoint;
            // NEW: Check if the tool supports click-click creation (ghosting is part of this)
            const supportsClickClick = toolBeingCreated.supportsClickClickCreation?.() !== false;
            if (!supportsClickClick) {
                // If the tool does not support click-click, then no ghosting should occur.
                toolBeingCreated.setLastPoint(null); // Clear any ghost
                this._plugin.requestUpdate();
                return;
            }
            // Note: Ghosting only happens *after* the first point (P0) is committed.
            // toolBeingCreated.points().length will be 2 after the 1st click because .points() also looks at _lastPoint to make the length.
            // Only apply constraint if the tool has placed P1 (length is 1) and the Shift key is down
            if (toolBeingCreated.points().length > 0 && rawScreenPoint && isShiftKeyDown && toolBeingCreated.supportsShiftClickClickConstraint?.() === true) {
                // Anchor being dragged is conceptually the second anchor (index 1)
                const anchorIndexBeingDragged = 1;
                const phase = InteractionPhase.Creation; // Phase is Creation
                // 1. P0 is the constraint source. It's the first permanent point.
                const anchorIndexUsedForConstraint = 0;
                const originalLogicalPoint = toolBeingCreated.getPoint(anchorIndexUsedForConstraint);
                // 2. Construct the full points array needed by the constraint method (just P0 here)
                const allOriginalLogicalPoints = [originalLogicalPoint];
                // Check if the tool implements the optional constraint method
                if (toolBeingCreated.getShiftConstrainedPoint && originalLogicalPoint) {
                    // Apply the constraint logic using the correct anchor index
                    const constraintResult = toolBeingCreated.getShiftConstrainedPoint(// <<< CHANGE: Capture ConstraintResult
                    anchorIndexBeingDragged, rawScreenPoint, phase, originalLogicalPoint, allOriginalLogicalPoints);
                    // Extract the Point from the result for ghosting
                    finalScreenPoint = constraintResult.point; // <<< CHANGE: Extract Point property
                }
            }
            if (finalScreenPoint) {
                const logicalPoint = this.screenPointToLineToolPoint(finalScreenPoint);
                if (logicalPoint) {
                    // We use setLastPoint for ghosting until the final point is committed.
                    if (toolBeingCreated.points().length > 0) {
                        toolBeingCreated.setLastPoint(logicalPoint);
                    }
                }
                else {
                    toolBeingCreated.setLastPoint(null);
                }
            }
            else {
                toolBeingCreated.setLastPoint(null);
            }
            this._plugin.requestUpdate();
            return;
        }
        // --- Hover Logic ---
        const point = params.point ? new Point(params.point.x, params.point.y) : null;
        const hitResult = point ? this._hitTest(point) : null;
        const hoveredTool = hitResult ? hitResult.tool : null;
        if (this._hoveredTool && this._hoveredTool !== hoveredTool) {
            this._hoveredTool.setHovered(false);
        }
        this._hoveredTool = hoveredTool;
        if (hoveredTool) {
            hoveredTool.setHovered(true);
        }
    }
    /**
     * Performs a hit test on all visible line tools, iterating them in reverse Z-order (top-most first).
     *
     * @param point - The screen coordinates to test against all tools.
     * @returns An object containing the hit tool, the hit point index, and the suggested cursor type, or `null` if no tool was hit.
     * @private
     */
    _hitTest(point) {
        // Iterate in reverse for Z-order (topmost first)
        const tools = Array.from(this._tools.values()).reverse();
        for (const tool of tools) {
            if (!tool.options().visible) {
                continue;
            }
            const hitResult = tool._internalHitTest(point.x, point.y);
            if (hitResult) {
                return {
                    tool: tool,
                    // The data() method gives us the payload, which is { pointIndex, cursorType }
                    pointIndex: hitResult.data()?.pointIndex ?? null,
                    // [NEW] Pass the cursor through
                    suggestedCursor: hitResult.data()?.suggestedCursor ?? null
                };
            }
        }
        return null;
    }
    /**
     * Clears the selection state of the currently selected tool, if one exists.
     *
     * This is a public utility often called by the {@link LineToolsCorePlugin} or by the `InteractionManager`'s internal logic.
     *
     * @returns void
     */
    deselectAllTools() {
        //console.log('inside deselectAll for CorePlugin call')
        if (this._selectedTool) {
            //console.log('inside selectedTool')
            this._selectedTool.setSelected(false);
            this._selectedTool = null;
            this._plugin.requestUpdate();
        }
    }
    /**
     * Converts a raw browser `MouseEvent` (which uses screen coordinates) into a chart-relative
     * {@link Point} object (CSS pixels relative to the chart canvas).
     *
     * @param event - The browser's MouseEvent.
     * @returns A chart-relative {@link Point} object, or `null` if the chart element bounding box cannot be retrieved.
     * @private
     */
    _eventToPoint(event) {
        const rect = this._chart.chartElement().getBoundingClientRect();
        return new Point(event.clientX - rect.left, event.clientY - rect.top);
    }
}

// /src/model/price-axis-label-stacking-manager.ts
const LABEL_MARGIN_PX = 2; // Additional margin between labels
/**
 * Manages the vertical stacking and collision detection for price axis labels generated by line tools.
 *
 * This utility ensures that multiple labels targeting similar Y-coordinates do not overlap
 * on the price scale by calculating and applying a shifted "fixed coordinate" to the colliding labels.
 * This process runs synchronously during the `BaseLineTool.updateAllViews()` cycle.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class PriceAxisLabelStackingManager {
    /**
     * Initializes the stacking manager and sets up the default renderer options based on chart and series settings.
     *
     * @param chart - The Lightweight Charts chart API instance.
     * @param series - The primary series API instance.
     */
    constructor(chart, series) {
        this._labels = new Map();
        this._priceAxisRendererOptions = null;
        this._currentPriceScale = null;
        this._chart = chart;
        this._series = series;
        console.log('[PriceAxisLabelStackingManager] Initializing...');
        // NEW: Initialize _priceAxisRendererOptions in the constructor
        const chartOptions = this._chart.options();
        const layoutOptions = chartOptions.layout;
        const priceScaleOptions = this._series.priceScale().options(); // Get for default price scale
        this._priceAxisRendererOptions = {
            font: `${layoutOptions.fontSize || 12}px ${layoutOptions.fontFamily || 'sans-serif'}`,
            fontFamily: layoutOptions.fontFamily || 'sans-serif',
            color: layoutOptions.textColor || '#FFFFFF',
            fontSize: layoutOptions.fontSize || 12,
            baselineOffset: 0,
            borderSize: priceScaleOptions.borderVisible ? 1 : 0,
            paddingBottom: 2,
            paddingInner: 2,
            paddingOuter: 2,
            paddingTop: 2,
            tickLength: priceScaleOptions.ticksVisible ? 4 : 0,
        };
        console.log('[PriceAxisLabelStackingManager] Initial PriceAxisViewRendererOptions set from chart/series defaults.');
    }
    /**
     * Converts a Y-coordinate (pixel) to a price value using the current price scale.
     *
     * @param coordinate - The Y-coordinate in pixels.
     * @returns The corresponding price value, or `null` if the price scale is not available.
     * @private
     */
    _coordinateToPrice(coordinate) {
        if (this._currentPriceScale) {
            return this._series.coordinateToPrice(coordinate);
        }
        return null;
    }
    /**
     * Registers a new label or updates an existing one for collision detection.
     *
     * Each label provides its desired coordinate, height, and a callback function for the manager
     * to apply the final, collision-free coordinate.
     *
     * @param labelData - The {@link LabelDataForStacking} object containing the label's required information.
     * @returns void
     */
    registerLabel(labelData) {
        !this._labels.has(labelData.id);
        this._labels.set(labelData.id, labelData);
        // console.log(`[PALSManager Debug] Label ${isNew ? 'registered' : 'updated'}: ${labelData.id} (Tool: ${labelData.toolId})`);
    }
    /**
     * Removes a label from the tracking system.
     *
     * This is called when a tool is destroyed or when a label becomes structurally invalid/invisible.
     * It also clears any fixed coordinate that was previously applied to the label.
     *
     * @param id - The unique identifier of the label to unregister (e.g., `toolId + '-p' + pointIndex`).
     * @returns void
     */
    unregisterLabel(id) {
        const label = this._labels.get(id);
        if (label) {
            label.setFixedCoordinate(undefined);
            this._labels.delete(id);
            // console.log(`[PALSManager Debug] Label unregistered: ${id}`);
        }
    }
    /**
     * Updates the rendering options that define the size and padding of price axis labels.
     *
     * This information is critical for accurate height calculation during the collision detection process.
     *
     * @param options - The new {@link PriceAxisViewRendererOptions} object.
     * @returns void
     */
    setPriceAxisRendererOptions(options) {
        // Only update if options are significantly different, or if there's no options yet.
        // Deep comparison is complex, a shallow check or just always overwriting is simpler for now.
        this._priceAxisRendererOptions = options;
        // console.log('[PALSManager Debug] PriceAxisViewRendererOptions updated.');
    }
    /**
     * Executes the core stacking algorithm.
     *
     * 1. Collects all currently active and valid labels.
     * 2. Sorts them by their original Y-coordinate (top-to-bottom).
     * 3. Iterates through the sorted list, calculating and applying a new `fixedCoordinate`
     *    to any label that collides with a previously processed label.
     *
     * This method must be called synchronously whenever a tool's position changes to ensure
     * the labels are correctly positioned before the chart redraws.
     *
     * @returns void
     */
    updateStacking() {
        if (!this._priceAxisRendererOptions) {
            console.warn('[PALSManager] Cannot update stacking: PriceAxisViewRendererOptions not set. Skipping stacking adjustment.');
            this._labels.forEach(label => label.setFixedCoordinate(undefined));
            return;
        }
        const priceScale = this._series.priceScale();
        if (!priceScale) {
            console.warn('[PALSManager] No price scale available. Skipping stacking adjustment.');
            this._labels.forEach(label => label.setFixedCoordinate(undefined));
            return;
        }
        this._currentPriceScale = priceScale;
        const activeLabels = [];
        this._labels.forEach(label => {
            if (label.isVisible() && isFinite(label.originalCoordinate) && label.height > 0) {
                activeLabels.push(label);
            }
            else {
                // Ensure invisible/invalid labels have their fixed coord cleared
                label.setFixedCoordinate(undefined);
            }
        });
        //console.log(`--- [PALS DEBUG] Starting Stacking Update for ${activeLabels.length} Active Labels ---`);
        if (activeLabels.length < 2) {
            // For 0 or 1 labels, ensure it has no fixed coordinate so it draws at its original location.
            activeLabels.forEach(label => label.setFixedCoordinate(undefined));
            return;
        }
        // Sort labels by their *original* Y-coordinate (top-most first on screen meaning smallest Coordinate)
        // This ensures we always resolve collisions from top to bottom.
        activeLabels.sort((a, b) => a.originalCoordinate - b.originalCoordinate);
        let lastOccupiedBottomCoord = undefined;
        for (let i = 0; i < activeLabels.length; i++) {
            const currentLabel = activeLabels[i];
            let newFixedCoord = currentLabel.originalCoordinate;
            const currentLabelHalfHeight = currentLabel.height / 2;
            // Calculate the effective top of the *unadjusted* label's space (its original desired position)
            const currentLabelTop = (currentLabel.originalCoordinate - currentLabelHalfHeight);
            // *** START DEBUG LOGGING ***
            //console.log(`[PALS LOG] --- Label ${currentLabel.id} [${i}] ---`);
            //console.log(`[PALS LOG] Original Coord (Center Y): ${currentLabel.originalCoordinate.toFixed(2)} | Height: ${currentLabel.height.toFixed(2)}`);
            //console.log(`[PALS LOG] Current Label Top Y: ${currentLabelTop.toFixed(2)}`);
            //console.log(`[PALS LOG] Last Occupied Bottom Y: ${lastOccupiedBottomCoord ? lastOccupiedBottomCoord.toFixed(2) : 'None'}`);
            // *** END DEBUG LOGGING ***
            if (lastOccupiedBottomCoord !== undefined) {
                const collisionThreshold = (lastOccupiedBottomCoord + LABEL_MARGIN_PX);
                //console.log(`[PALS LOG] Collision Threshold Y: ${collisionThreshold.toFixed(2)}`);
                if (currentLabelTop < collisionThreshold) {
                    // *** COLLISION DETECTED ***
                    //console.log(`[PALS LOG] *** COLLISION: ${currentLabelTop.toFixed(2)} < ${collisionThreshold.toFixed(2)} ***`);
                    const newTop = collisionThreshold;
                    newFixedCoord = (newTop + currentLabelHalfHeight);
                    // Log the shift
                    //console.log(`[PALS LOG] SHIFTED: New Center Y: ${newFixedCoord.toFixed(2)}`);
                }
            }
            // --- Apply and Store Final Coordinate ---
            // 1. Set the fixed coordinate on the view (undefined if no shift was needed)
            if (newFixedCoord !== currentLabel.originalCoordinate) {
                currentLabel.setFixedCoordinate(newFixedCoord);
            }
            else {
                currentLabel.setFixedCoordinate(undefined);
            }
            // 2. Determine the final Y-coordinate that was applied
            // This is either the original Y or the newly shifted Y.
            const finalCenterY = newFixedCoord !== currentLabel.originalCoordinate ? newFixedCoord : currentLabel.originalCoordinate;
            // 3. Update the space reserved for the next label
            lastOccupiedBottomCoord = (finalCenterY + currentLabelHalfHeight);
            //console.log(`[PALS LOG] FINAL lastOccupiedBottomCoord: ${lastOccupiedBottomCoord.toFixed(2)}`);
        }
        //console.log(`--- [PALS DEBUG] Finished Stacking Update ---`);
    }
}

// /src/core-plugin.ts
/**
 * The main implementation of the Line Tools Core Plugin.
 *
 * This class acts as the central controller for adding, managing, and interacting with line tools
 * on a Lightweight Chart. It coordinates between the chart's API, the series, and the internal
 * interaction manager to handle user input, rendering, and state management of drawing tools.
 *
 * While typically initialized via the `createLineToolsPlugin` factory, this class implements
 * the {@link ILineToolsApi} interface which defines the primary methods available to consumers.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item (e.g., `Time`, `UTCTimestamp`, or `number`), matching the chart's configuration.
 */
class LineToolsCorePlugin {
    constructor(chart, series, horzScaleBehavior) {
        this._tools = new Map();
        // Delegates for broadcasting V3.8-compatible events
        this._doubleClickDelegate = new Delegate();
        this._afterEditDelegate = new Delegate();
        // Throttled Stacking Update
        this._stackingUpdateScheduled = false;
        this._chart = chart;
        this._series = series;
        this._horzScaleBehavior = horzScaleBehavior;
        this._toolRegistry = new ToolRegistry();
        this._interactionManager = new InteractionManager(this, this._chart, this._series, this._tools, this._toolRegistry);
        this._priceAxisLabelStackingManager = new PriceAxisLabelStackingManager(this._chart, this._series);
        console.log('Line Tools Core Plugin initialized.');
    }
    /**
     * Requests a redraw of the chart.
     *
     * This method is the primary mechanism for internal components (like the {@link InteractionManager} or individual tools)
     * to trigger a render cycle after state changes (e.g., hovering, selecting, or modifying a tool).
     * It effectively calls `chart.applyOptions({})` to signal that the primitives need repainting.
     *
     * @internal
     * @returns void
     */
    requestUpdate() {
        // Applying empty options is a lightweight way to tell the chart
        // that something has changed and it needs to re-render.
        this._chart.applyOptions({});
        // Centralized control now relies on the BaseLineTool to call the
        // Stacking Manager at the right time. The Core Plugin should no longer manage
        // the throttle here to avoid the premature call.
    }
    /**
     * Registers a custom line tool class with the plugin.
     *
     * Before a specific tool type (e.g., 'Rectangle', 'FibRetracement') can be created via
     * {@link addLineTool} or {@link importLineTools}, its class constructor must be registered here.
     * This maps a string identifier to the actual class implementation.
     *
     * @param type - The unique string identifier for the tool type (e.g., 'Rectangle').
     * @param toolClass - The class constructor for the tool, which must extend {@link BaseLineTool}.
     * @returns void
     *
     * @example
     * import { LineToolRectangle } from './my-tools/rectangle';
     * plugin.registerLineTool('Rectangle', LineToolRectangle);
     */
    registerLineTool(type, toolClass) {
        this._toolRegistry.registerTool(type, toolClass);
        console.log(`Registered line tool: ${type}`);
    }
    // #region ILineToolsApi Implementation
    /**
     * Adds a new line tool to the chart.
     *
     * If `points` is provided, the tool is drawn immediately at those coordinates.
     * If `points` is an empty array, `null`, or undefined, the plugin enters
     * **interactive creation mode**, allowing the user to click on the chart to draw the tool.
     *
     * @param type - The type of line tool to create (e.g., 'TrendLine', 'Rectangle').
     * @param points - An array of logical points (timestamp/price) to define the tool. Pass `[]` to start interactive drawing.
     * @param options - Optional configuration object to customize the tool's appearance (line color, width, etc.).
     * @returns The unique string ID of the newly created tool.
     *
     * @example
     * // Start drawing a Trend Line interactively (user clicks to place points)
     * plugin.addLineTool('TrendLine');
     *
     * @example
     * // Programmatically add a Rectangle at specific coordinates
     * plugin.addLineTool('Rectangle', [
     *   { timestamp: 1620000000, price: 100 },
     *   { timestamp: 1620086400, price: 120 }
     * ], {
     *   line: { color: '#ff0000', width: 2 },
     *   background: { color: 'rgba(255, 0, 0, 0.2)' }
     * });
     */
    addLineTool(type, points, options) {
        try {
            // Check if points are provided and signal interactive creation if they are empty
            const initiateInteractive = (points === null || points === undefined || points.length === 0);
            const tool = this._createAndAddTool(type, points || [], options, undefined, initiateInteractive);
            return tool.id();
        }
        catch (e) {
            console.error(e.message);
            return '';
        }
    }
    /**
     * Creates a new line tool with a specific ID, or updates it if that ID already exists.
     *
     * Unlike `addLineTool`, this method requires a specific ID. It is primarily used for
     * state synchronization (e.g., `importLineTools`) where preserving the original tool ID is critical.
     *
     * @param type - The type of the line tool.
     * @param points - The points defining the tool.
     * @param options - The configuration options.
     * @param id - The unique ID to assign to the tool (or the ID of the tool to update).
     * @returns void
     */
    createOrUpdateLineTool(type, points, options, id) {
        const existingTool = this._tools.get(id);
        if (existingTool) {
            // Update existing tool
            existingTool.setPoints(points);
            existingTool.applyOptions(options);
            console.log(`Updated line tool with ID: ${id}`);
        }
        else {
            // Create new tool with specified ID
            try {
                this._createAndAddTool(type, points, options, id);
            }
            catch (e) {
                console.error(e.message);
            }
        }
    }
    /**
     * Removes one or more line tools from the chart based on their unique IDs.
     *
     * @param ids - An array of unique string IDs representing the tools to remove.
     * @returns void
     *
     * @example
     * plugin.removeLineToolsById(['tool-id-1', 'tool-id-2']);
     */
    removeLineToolsById(ids) {
        console.log(`[CorePlugin] Removing tools. Current tool count: ${this._tools.size}`);
        let needsUpdate = false;
        ids.forEach(id => {
            const tool = this._tools.get(id);
            if (tool) {
                this._interactionManager.detachTool(tool); // DETACH FROM LWCHARTS FIRST
                tool.destroy(); // Then call our plugin's internal cleanup
                this._tools.delete(id); // Then remove from plugin's map
                needsUpdate = true;
                console.log(`Removed line tool with ID: ${id}`);
            }
        });
        if (needsUpdate) {
            this._chart.applyOptions({}); // Trigger a chart update
        }
    }
    /**
     * Removes all line tools whose IDs match the provided Regular Expression.
     *
     * This allows for bulk deletion of tools based on naming patterns (e.g., removing all tools tagged with 'temp-').
     *
     * @param regex - The Regular Expression to match against tool IDs.
     * @returns void
     *
     * @example
     * // Remove all tools starting with "drawing-"
     * plugin.removeLineToolsByIdRegex(/^drawing-/);
     */
    removeLineToolsByIdRegex(regex) {
        const idsToRemove = [];
        this._tools.forEach(tool => {
            if (regex.test(tool.id())) {
                idsToRemove.push(tool.id());
            }
        });
        if (idsToRemove.length > 0) {
            this.removeLineToolsById(idsToRemove);
        }
    }
    /**
     * Removes the currently selected line tool(s) from the chart.
     *
     * This is typically wired to a keyboard shortcut (like the Delete key) or a UI button
     * to allow users to delete the specific tool they are interacting with.
     *
     * @returns void
     */
    removeSelectedLineTools() {
        const selectedIds = [];
        this._tools.forEach(tool => {
            if (tool.isSelected()) {
                selectedIds.push(tool.id());
            }
        });
        if (selectedIds.length > 0) {
            this.removeLineToolsById(selectedIds);
        }
    }
    /**
     * Removes all line tools managed by this plugin from the chart.
     *
     * This performs a full cleanup, detaching every tool from the chart's series and
     * releasing associated resources.
     *
     * @returns void
     */
    removeAllLineTools() {
        const allIds = Array.from(this._tools.keys());
        if (allIds.length > 0) {
            this.removeLineToolsById(allIds);
        }
        console.log(`[CorePlugin] All tools removed. Final total tool count: ${this._tools.size}`);
    }
    /**
     * Retrieves the data for all line tools that are currently selected by the user.
     *
     * @returns A JSON string representing an array of the selected tools' data.
     *
     * @example
     * const selected = JSON.parse(plugin.getSelectedLineTools());
     * console.log(`User has selected ${selected.length} tools.`);
     */
    getSelectedLineTools() {
        const selectedTools = [];
        this._tools.forEach(tool => {
            if (tool.isSelected()) {
                selectedTools.push(tool.getExportData());
            }
        });
        return JSON.stringify(selectedTools);
    }
    /**
     * Retrieves the data for a specific line tool by its unique ID.
     *
     * @param id - The unique identifier of the tool to retrieve.
     * @returns A JSON string representing an array containing the single tool's data, or an empty array `[]` if the ID was not found.
     *
     * @remarks
     * The return type is a JSON string to maintain compatibility with the V3.8 API structure.
     * You will typically need to `JSON.parse()` the result to work with the data programmatically.
     */
    getLineToolByID(id) {
        const tool = this._tools.get(id);
        return tool ? JSON.stringify([tool.getExportData()]) : JSON.stringify([]);
    }
    /**
     * Retrieves a list of line tools whose IDs match a specific Regular Expression.
     *
     * This is useful for grouping tools by naming convention (e.g., fetching all tools with IDs starting with 'trend-').
     *
     * @param regex - The Regular Expression to match against tool IDs.
     * @returns A JSON string representing an array of all matching line tools.
     *
     * @example
     * // Get all tools with IDs starting with "fib-"
     * const tools = plugin.getLineToolsByIdRegex(/^fib-/);
     */
    getLineToolsByIdRegex(regex) {
        const matchingTools = [];
        this._tools.forEach(tool => {
            if (regex.test(tool.id())) {
                matchingTools.push(tool.getExportData());
            }
        });
        return JSON.stringify(matchingTools);
    }
    /**
     * Applies new configuration options or points to an existing line tool.
     *
     * This method is used to dynamically update a tool's appearance or position after it
     * has been created. It performs a partial merge, so you only need to provide the properties
     * you wish to change.
     *
     * Note: If the tool is currently selected, it will be deselected upon update to ensure visual consistency.
     *
     * @param toolData - An object containing the tool's `id`, `toolType`, and the `options` or `points` to update.
     * @returns `true` if the tool was found and updated, `false` otherwise (e.g., ID not found or type mismatch).
     *
     * @example
     * // Change the color of an existing tool to blue
     * plugin.applyLineToolOptions({
     *   id: 'existing-tool-id',
     *   toolType: 'TrendLine',
     *   options: {
     *     line: { color: 'blue' }
     *   },
     *   points: [] // Points can be omitted if not changing
     * });
     */
    applyLineToolOptions(toolData) {
        const tool = this._tools.get(toolData.id);
        if (!tool || tool.toolType !== toolData.toolType) {
            console.error(`Cannot apply options: Tool with ID "${toolData.id}" not found or type mismatch.`);
            return false;
        }
        // Behavioral change: Deselect the tool after applying options, matching V3.8
        if (tool.isSelected()) {
            tool.setSelected(false);
        }
        if (toolData.options) {
            tool.applyOptions(toolData.options);
        }
        if (toolData.points) {
            tool.setPoints(toolData.points);
        }
        this._chart.applyOptions({}); // Trigger update
        return true;
    }
    /**
     * Serializes the state of all currently drawn line tools into a JSON string.
     *
     * This export format is compatible with `importLineTools` and the V3.8 line tools plugin,
     * making it suitable for saving chart state to a database or local storage.
     *
     * @returns A JSON string representing an array of all line tools and their current state.
     *
     * @example
     * const savedState = plugin.exportLineTools();
     * localStorage.setItem('my-chart-tools', savedState);
     */
    exportLineTools() {
        const allToolsData = Array.from(this._tools.values()).map(tool => tool.getExportData());
        console.log('Exporting all line tools:', allToolsData);
        return JSON.stringify(allToolsData);
    }
    /**
     * Imports a set of line tools from a JSON string.
     *
     * This method parses the provided JSON (typically generated by {@link exportLineTools}) and
     * creates or updates the tools on the chart.
     *
     * **Note:** This is a non-destructive import. It will not remove existing tools unless
     * the imported data overwrites them by ID. It creates new tools if the IDs do not exist
     * and updates existing ones if they do.
     *
     * @param json - A JSON string containing an array of line tool export data.
     * @returns `true` if the import process completed successfully, `false` if the JSON was invalid.
     */
    importLineTools(json) {
        // Behavioral change: Do NOT removeAll() first, just use createOrUpdate
        // Ensure it's synchronous and returns boolean
        try {
            const parsedTools = JSON.parse(json);
            if (!Array.isArray(parsedTools)) {
                throw new Error('Import data is not a valid array of line tools.');
            }
            parsedTools.forEach((toolData) => {
                // Use createOrUpdateLineTool to handle updating existing or creating new
                this.createOrUpdateLineTool(toolData.toolType, toolData.points, toolData.options, toolData.id);
            });
            console.log(`Imported ${parsedTools.length} line tools.`);
            this.requestUpdate(); // Trigger a single update after all imports
            return true;
        }
        catch (e) {
            console.error('Failed to import line tools:', e.message);
            return false;
        }
    }
    /**
     * Subscribes a callback function to the "Double Click" event.
     *
     * This event fires whenever a user double-clicks on an existing line tool.
     * It is often used to open custom settings modals or perform specific actions on the tool.
     *
     * @param handler - The function to execute when the event fires. Receives {@link LineToolsDoubleClickEventParams}.
     * @returns void
     */
    subscribeLineToolsDoubleClick(handler) {
        this._doubleClickDelegate.subscribe(handler);
    }
    /**
     * Unsubscribes a previously registered callback from the "Double Click" event.
     *
     * @param handler - The specific callback function that was passed to {@link subscribeLineToolsDoubleClick}.
     * @returns void
     */
    unsubscribeLineToolsDoubleClick(handler) {
        this._doubleClickDelegate.unsubscribe(handler);
    }
    /**
     * Subscribes a callback function to the "After Edit" event.
     *
     * This event fires whenever a line tool is:
     * 1. Modified (points moved or properties changed).
     * 2. Finished creating (the final point was placed).
     *
     * @param handler - The function to execute when the event fires. Receives {@link LineToolsAfterEditEventParams}.
     * @returns void
     *
     * @example
     * plugin.subscribeLineToolsAfterEdit((params) => {
     *   console.log('Tool edited:', params.selectedLineTool.id);
     *   console.log('Edit stage:', params.stage);
     * });
     */
    subscribeLineToolsAfterEdit(handler) {
        this._afterEditDelegate.subscribe(handler);
    }
    /**
     * Unsubscribes a previously registered callback from the "After Edit" event.
     *
     * Use this to stop listening for tool creation or modification events, typically during
     * component cleanup or when the chart is being destroyed.
     *
     * @param handler - The specific callback function that was passed to {@link subscribeLineToolsAfterEdit}.
     * @returns void
     */
    unsubscribeLineToolsAfterEdit(handler) {
        this._afterEditDelegate.unsubscribe(handler);
    }
    /**
     * Sets the crosshair position to a specific pixel coordinate (x, y) on the chart.
     *
     * This method acts as a high-level proxy for the Lightweight Charts API. It converts the
     * provided screen pixel coordinates into the logical time and price values required by the chart
     * to position the crosshair.
     *
     * @param x - The x-coordinate (in pixels) relative to the chart's canvas.
     * @param y - The y-coordinate (in pixels) relative to the chart's canvas.
     * @param visible - Controls the visibility of the crosshair. If `false`, the crosshair is cleared.
     * @returns void
     */
    setCrossHairXY(x, y, visible) {
        if (!visible) {
            this.clearCrossHair();
            return;
        }
        const chart = this._chart;
        const mainSeries = this._series;
        // Use the robust screenPointToLineToolPoint from InteractionManager
        // to get an interpolated time and price from the screen coordinates.
        const lineToolPoint = this._interactionManager.screenPointToLineToolPoint(new Point(x, y));
        if (lineToolPoint) {
            // Cast lineToolPoint.timestamp directly to HorzScaleItem.
            // This tells TypeScript that we know lineToolPoint.timestamp (a number) 
            // is compatible with the HorzScaleItem type expected by the current chart setup.
            const horizontalPosition = lineToolPoint.timestamp;
            const priceValue = lineToolPoint.price;
            chart.setCrosshairPosition(priceValue, horizontalPosition, mainSeries);
        }
        else {
            // If conversion fails (e.g., coordinates are out of valid range or interpolation not possible), clear the crosshair
            this.clearCrossHair();
        }
    }
    /**
     * Clears the chart's crosshair, making it invisible.
     *
     * This acts as a proxy for the underlying Lightweight Charts API `clearCrosshairPosition()`.
     * Use this to programmatically hide the crosshair (e.g., when the mouse leaves a custom container).
     *
     * @returns void
     */
    clearCrossHair() {
        this._chart.clearCrosshairPosition();
    }
    // #endregion
    /**
     * Broadcasts an event indicating that a line tool has been double-clicked.
     *
     * This method is called internally by the {@link InteractionManager} upon detecting a double-click
     * interaction on a tool. It triggers listeners subscribed via {@link subscribeLineToolsDoubleClick}.
     *
     * @internal
     * @param tool - The tool instance that was double-clicked.
     * @returns void
     */
    fireDoubleClickEvent(tool) {
        console.log(`[CorePlugin] Firing DoubleClick event for tool: ${tool.id()}`);
        const eventParams = {
            selectedLineTool: tool.getExportData(),
        };
        this._doubleClickDelegate.fire(eventParams);
    }
    /**
     * Broadcasts an event indicating that a line tool has been modified or created.
     *
     * This method is primarily called internally by the {@link InteractionManager} when a user
     * finishes drawing or editing a tool. It triggers any listeners subscribed via
     * {@link subscribeLineToolsAfterEdit}.
     *
     * @internal
     * @param tool - The tool instance that was edited.
     * @param stage - The stage of the edit action (e.g., 'lineToolEdited' for modification, 'lineToolFinished' for creation).
     * @returns void
     */
    fireAfterEditEvent(tool, stage) {
        console.log(`[CorePlugin] Firing AfterEdit event for tool: ${tool.id()} with stage: ${stage}`);
        const eventParams = {
            selectedLineTool: tool.getExportData(),
            stage: stage,
        };
        this._afterEditDelegate.fire(eventParams);
    }
    /**
     * Internal factory method to instantiate and register a new tool.
     *
     * This handles the common logic for `addLineTool`, `createOrUpdateLineTool`, and `importLineTools`,
     * including checking the registry, creating the instance, attaching it to the series, and
     * managing interactive state if required.
     *
     * @param type - The tool type identifier.
     * @param points - The initial points for the tool.
     * @param options - Optional configuration options.
     * @param id - Optional specific ID (if not provided, the tool generates its own).
     * @param initiateInteractive - If `true`, sets the tool to "Creating" mode and updates the InteractionManager.
     * @returns The newly created `BaseLineTool` instance.
     * @throws Error if the tool type is not registered.
     * @private
     */
    _createAndAddTool(type, points, options, id, initiateInteractive = false // New parameter to signal interactive drawing initiation
    ) {
        if (!this._toolRegistry.isRegistered(type)) {
            throw new Error(`Cannot create tool: Line tool type "${type}" is not registered.`);
        }
        if (initiateInteractive) {
            this._interactionManager.deselectAllTools();
        }
        const ToolClass = this._toolRegistry.getToolClass(type);
        const newTool = new ToolClass(this, this._chart, this._series, this._horzScaleBehavior, options, points, this._priceAxisLabelStackingManager);
        if (id) {
            newTool.setId(id);
        }
        this._tools.set(newTool.id(), newTool);
        this._series.attachPrimitive(newTool);
        // NEW LOGIC for addLineTool's interactive initiation
        if (initiateInteractive) {
            newTool.setCreating(true); // Mark the tool as actively being created
            this._interactionManager.setCurrentToolCreating(newTool); // Set THIS tool as the target for interactive drawing
        }
        this._chart.applyOptions({}); // Trigger a chart update to render the new tool
        console.log(`Created or updated line tool: ${type} with ID: ${newTool.id()}`);
        return newTool;
    }
    /**
     * Retrieves the instance of the Price Axis Label Stacking Manager.
     *
     * This manager is responsible for preventing overlap between the price labels of different tools
     * on the Y-axis. This accessor is primarily used internally by {@link BaseLineTool} to register its labels.
     *
     * @internal
     * @returns The shared {@link PriceAxisLabelStackingManager} instance.
     */
    getPriceAxisLabelStackingManager() {
        return this._priceAxisLabelStackingManager;
    }
}

// /src/utils/canvas-helpers.ts
/**
 * This file contains lower-level canvas drawing utilities adapted from the
 * Lightweight Charts V3.8 build's 'renderers' and 'helpers/canvas-helpers'
 * to be reusable components within our plugin.
 */
// Point,  and Segment are now our locally defined types from utils/geometry.ts.
// #region Basic Canvas Operations (adapted from V3.8 helpers/canvas-helpers.ts)
/**
 * Clears a specific rectangular area on the canvas and fills it immediately with a solid color.
 *
 * This function uses the `copy` global composite operation to replace existing pixels
 * entirely, which is often more performant or predictable than using `clearRect` followed by `fillRect`
 * in layering scenarios.
 *
 * @param ctx - The canvas rendering context to draw on.
 * @param x - The x-coordinate of the top-left corner of the rectangle.
 * @param y - The y-coordinate of the top-left corner of the rectangle.
 * @param w - The width of the rectangle in pixels.
 * @param h - The height of the rectangle in pixels.
 * @param clearColor - The CSS color string to fill the cleared area with (e.g., '#FFFFFF' or 'rgba(0,0,0,0)').
 */
function clearRect(ctx, x, y, w, h, clearColor) {
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = clearColor;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}
/**
 * Clears a specific rectangular area on the canvas and fills it with a vertical linear gradient.
 *
 * Similar to {@link clearRect}, this uses the `copy` composite operation. It creates a gradient
 * spanning from the top (`y`) to the bottom (`y + h`) of the specified area.
 *
 * @param ctx - The canvas rendering context to draw on.
 * @param x - The x-coordinate of the top-left corner of the rectangle.
 * @param y - The y-coordinate of the top-left corner of the rectangle.
 * @param w - The width of the rectangle in pixels.
 * @param h - The height of the rectangle in pixels.
 * @param topColor - The CSS color string for the start (top) of the gradient.
 * @param bottomColor - The CSS color string for the end (bottom) of the gradient.
 */
function clearRectWithGradient(ctx, x, y, w, h, topColor, bottomColor) {
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}
// #endregion
// #region Line Styles and Drawing (adapted from V3.8 renderers/draw-line.ts)
/**
 * Calculates the specific line dash array pattern for a given `LineStyle`.
 *
 * This helper maps abstract style enums (like `LineStyle.Dashed` or `LineStyle.SparseDotted`)
 * into the concrete numerical arrays required by the HTML5 Canvas API's `setLineDash`.
 * The pattern is scaled relative to the current line width of the context to ensure visual consistency.
 *
 * @param ctx - The canvas rendering context (used to retrieve the current `lineWidth`).
 * @param style - The `LineStyle` enum value to convert.
 * @returns An array of numbers representing the dash pattern (segments and gaps), or an empty array for solid lines.
 */
function computeDashPattern(ctx, style) {
    switch (style) {
        case LineStyle.Solid: return [];
        case LineStyle.Dotted: return [ctx.lineWidth, ctx.lineWidth];
        case LineStyle.Dashed: return [2 * ctx.lineWidth, 2 * ctx.lineWidth];
        case LineStyle.LargeDashed: return [6 * ctx.lineWidth, 6 * ctx.lineWidth];
        case LineStyle.SparseDotted: return [ctx.lineWidth, 4 * ctx.lineWidth];
        default: return [];
    }
}
/**
 * Applies a specific dash pattern to the canvas rendering context.
 *
 * This low-level wrapper ensures compatibility across different browser implementations,
 * handling standard `setLineDash` as well as legacy vendor-prefixed properties
 * (`mozDash`, `webkitLineDash`) if necessary.
 *
 * @param ctx - The canvas rendering context to configure.
 * @param dashPattern - The array of numbers representing distances to alternately draw a line and a gap.
 */
function setLineDash(ctx, dashPattern) {
    if (ctx.setLineDash) {
        ctx.setLineDash(dashPattern);
    }
    else {
        // Fallback for older browsers (mozDash and webkitLineDash were non-standard)
        // Note: We need to cast to any to access these non-standard properties.
        ctx.mozDash = dashPattern;
        ctx.webkitLineDash = dashPattern;
    }
}
/**
 * Configures the canvas context with the dash pattern corresponding to a specific `LineStyle`.
 *
 * This is a high-level utility that combines {@link computeDashPattern} and {@link setLineDash}.
 * It also resets the `lineDashOffset` to 0 to ensure the pattern starts cleanly at the beginning of the path.
 *
 * @param ctx - The canvas rendering context to configure.
 * @param style - The `LineStyle` enum value to apply.
 */
function setLineStyle(ctx, style) {
    ctx.lineDashOffset = 0;
    const dashPattern = computeDashPattern(ctx, style);
    setLineDash(ctx, dashPattern);
}
/**
 * Calculates a scaling multiplier for line decorations (such as arrows or circles) based on the line's width.
 *
 * This utility helps maintain visual balance; as lines get thicker, the decoration size multiplier
 * typically decreases to prevent end caps from becoming disproportionately large.
 *
 * @param lineWidth - The width of the line in pixels.
 * @returns A numeric multiplier to be applied to the base decoration size.
 */
function computeEndLineSize(lineWidth) {
    switch (lineWidth) {
        case 1: return 3.5;
        case 2: return 2;
        case 3: return 1.5;
        case 4: return 1.25;
        default: return 1; // For other widths, use 1
    }
}
/**
 * Draws a pixel-perfect horizontal line on the canvas.
 *
 * This function applies a 0.5-pixel correction offset if the context's line width is odd (e.g., 1px).
 * This "pixel snapping" ensures the line renders sharply on the pixel grid rather than blurring across two pixel rows.
 *
 * @param ctx - The canvas rendering context.
 * @param y - The y-coordinate for the line position.
 * @param left - The starting x-coordinate.
 * @param right - The ending x-coordinate.
 */
function drawHorizontalLine(ctx, y, left, right) {
    ctx.beginPath();
    const correction = (ctx.lineWidth % 2) ? 0.5 : 0; // Pixel snapping
    ctx.moveTo(left, y + correction);
    ctx.lineTo(right, y + correction);
    ctx.stroke();
}
/**
 * Draws a pixel-perfect vertical line on the canvas.
 *
 * Similar to {@link drawHorizontalLine}, this function applies a 0.5-pixel correction offset
 * if the context's line width is odd, ensuring the line renders sharply on the pixel grid.
 *
 * @param ctx - The canvas rendering context.
 * @param x - The x-coordinate for the line position.
 * @param top - The starting y-coordinate.
 * @param bottom - The ending y-coordinate.
 */
function drawVerticalLine(ctx, x, top, bottom) {
    ctx.beginPath();
    const correction = (ctx.lineWidth % 2) ? 0.5 : 0; // Pixel snapping
    ctx.moveTo(x + correction, top);
    ctx.lineTo(x + correction, bottom);
    ctx.stroke();
}
/**
 * Draws a line segment between two points using the specified `LineStyle`.
 *
 * This is the primary general-purpose line drawing function. It includes safety checks for finite coordinates
 * and automatically delegates to {@link drawDashedLine} or {@link drawSolidLine} based on the style provided.
 *
 * @param ctx - The canvas rendering context.
 * @param x1 - The x-coordinate of the start point.
 * @param y1 - The y-coordinate of the start point.
 * @param x2 - The x-coordinate of the end point.
 * @param y2 - The y-coordinate of the end point.
 * @param style - The `LineStyle` to apply (Solid, Dashed, Dotted, etc.).
 */
function drawLine(ctx, x1, y1, x2, y2, style) {
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
        return;
    }
    if (style !== LineStyle.Solid) {
        drawDashedLine(ctx, x1, y1, x2, y2, style); // FIX: Pass style explicitly
    }
    else {
        drawSolidLine(ctx, x1, y1, x2, y2);
    }
}
/**
 * Draws a standard solid line path between two points.
 *
 * This is a performance-optimized primitive for drawing lines when the style is known to be `LineStyle.Solid`.
 * It assumes the line style/dash has already been handled or cleared by the caller (see {@link setLineStyle}).
 *
 * @param ctx - The canvas rendering context.
 * @param x1 - The x-coordinate of the start point.
 * @param y1 - The y-coordinate of the start point.
 * @param x2 - The x-coordinate of the end point.
 * @param y2 - The y-coordinate of the end point.
 */
function drawSolidLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}
/**
 * Draws a dashed or dotted line segment between two points.
 *
 * This function handles the context state management required for dashed lines.
 * It saves the context, applies the specific `LineStyle` (dash pattern), draws the path,
 * and then restores the context to prevent the dash pattern from leaking into subsequent operations.
 *
 * @param ctx - The canvas rendering context.
 * @param x1 - The x-coordinate of the start point.
 * @param y1 - The y-coordinate of the start point.
 * @param x2 - The x-coordinate of the end point.
 * @param y2 - The y-coordinate of the end point.
 * @param style - The `LineStyle` defining the dash pattern (e.g., Dashed, Dotted).
 */
function drawDashedLine(ctx, x1, y1, x2, y2, style) {
    ctx.save();
    ctx.beginPath();
    setLineStyle(ctx, style); // FIX: Pass style explicitly
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}
/**
 * Draws a solid circular decoration at the end of a line.
 *
 * This is typically used for "dot" line endings. The circle's size is automatically scaled
 * relative to the line width using {@link computeEndLineSize}. The circle is filled with
 * the current stroke color of the context.
 *
 * @param point - The center {@link Point} of the circle.
 * @param ctx - The canvas rendering context.
 * @param width - The width of the line this end decoration is attached to (used for scaling).
 */
function drawCircleEnd(point, ctx, width) {
    const circleEndMultiplier = computeEndLineSize(width);
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle; // Use current stroke color for fill
    ctx.beginPath();
    ctx.arc(point.x, point.y, width * circleEndMultiplier, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.restore();
}
/**
 * Calculates the geometric line segments required to draw an arrowhead.
 *
 * This function computes the vector geometry for a standard arrow shape pointing from `point0` to `point1`.
 * It scales the arrow size based on the provided line width and ensures the arrow is not drawn
 * if the line segment is too short to support it.
 *
 * @param point0 - The base (tail) point of the direction vector.
 * @param point1 - The tip (head) point of the arrow.
 * @param width - The width of the line (used for scaling the arrow head).
 * @returns An array of {@link Segment}s that form the arrow shape, or an empty array if the line is too short.
 */
function getArrowPoints(point0, point1, width) {
    const r = 0.5 * width;
    const n = Math.sqrt(2);
    const o = point1.subtract(point0);
    const a = o.normalized();
    const arrowheadMultiplier = computeEndLineSize(width);
    const l = 5 * width * arrowheadMultiplier;
    const c = 1 * r;
    // Check if the arrow is too small to draw meaningful points
    if (o.length() < l * 0.1) { // Adjusted threshold for very short lines
        return [];
    }
    const h = a.scaled(l);
    const d = point1.subtract(h);
    const u = a.transposed();
    const p = 1 * l; // Arrowhead spread multiplier
    const z = u.scaled(p);
    const m = d.add(z);
    const g = d.subtract(z);
    // f and v are for minor adjustments to the points to make the arrow look sharper,
    // assuming they are proportional to c (which is based on r and width)
    const f = m.subtract(point1).normalized().scaled(c);
    const v = g.subtract(point1).normalized().scaled(c);
    const S = point1.add(f); // Adjusted point m
    const y = point1.add(v); // Adjusted point g
    // Additional points for the base of the arrow to make it look robust
    const b_val = r * (n - 1);
    const w = u.scaled(b_val);
    const C_val = Math.min(l - r / n, r * n * 1); // Clamp length based on line width
    const P = a.scaled(C_val);
    const T = point1.subtract(P).subtract(w); // Base point 1 (tail)
    const x_val = point1.subtract(P).add(w); // Base point 2 (tail)
    return [[m, S], [g, y], [T, x_val]]; // The three segments forming the arrow
}
/**
 * Draws an arrow decoration at the end of a line segment.
 *
 * This function utilizes {@link getArrowPoints} to determine the geometry and then renders
 * the arrow using {@link drawLine}. This ensures that the arrow head itself respects the
 * dash style of the parent line (e.g., a dashed line has a dashed arrow head).
 *
 * @param point0 - The base (tail) point of the direction vector.
 * @param point1 - The tip (head) point where the arrow will be drawn.
 * @param ctx - The canvas rendering context.
 * @param width - The width of the line.
 * @param style - The `LineStyle` to apply to the arrow geometry.
 */
function drawArrowEnd(point0, point1, ctx, width, style) {
    if (point1.subtract(point0).length() < 1) {
        return;
    }
    const arrowPoints = getArrowPoints(point0, point1, width);
    for (const segment of arrowPoints) {
        drawLine(ctx, segment[0].x, segment[0].y, segment[1].x, segment[1].y, style); // FIX: Pass style explicitly
    }
}
// #endregion
// #region Rectangles & Borders (adapted from V3.8 renderers/draw-rect.ts)
/**
 * Internal helper that generates the path for a rounded rectangle on the canvas context.
 *
 * This function handles the logic of drawing line segments and circular arcs (`arcTo`)
 * for each corner based on the provided radii. It does not stroke or fill; it only
 * traces the path.
 *
 * @param ctx - The canvas rendering context.
 * @param x - The x-coordinate of the top-left corner.
 * @param y - The y-coordinate of the top-left corner.
 * @param w - The width of the rectangle.
 * @param h - The height of the rectangle.
 * @param radii - A tuple `[TL, TR, BR, BL]` specifying the radius for each corner.
 */
function drawPathRoundRect(ctx, x, y, w, h, radii) {
    ctx.beginPath();
    ctx.moveTo(x + radii[0], y);
    ctx.lineTo(x + w - radii[1], y);
    if (radii[1] !== 0) {
        ctx.arcTo(x + w, y, x + w, y + radii[1], radii[1]);
    }
    ctx.lineTo(x + w, y + h - radii[2]);
    if (radii[2] !== 0) {
        ctx.arcTo(x + w, y + h, x + w - radii[2], y + h, radii[2]);
    }
    ctx.lineTo(x + radii[3], y + h);
    if (radii[3] !== 0) {
        ctx.arcTo(x, y + h, x, y + h - radii[3], radii[3]);
    }
    ctx.lineTo(x, y + radii[0]);
    if (radii[0] !== 0) {
        ctx.arcTo(x, y, x + radii[0], y, radii[0]);
    }
    ctx.closePath();
}
/**
 * Draws the outline (stroke) of a rectangle with rounded corners.
 *
 * This function supports flexible corner radius definitions. You can provide a single number for uniform
 * corners, or an array to specify distinct radii for the top-left, top-right, bottom-right, and bottom-left corners.
 *
 * @param ctx - The canvas rendering context.
 * @param x - The x-coordinate of the top-left corner.
 * @param y - The y-coordinate of the top-left corner.
 * @param width - The width of the rectangle.
 * @param height - The height of the rectangle.
 * @param radius - The border radius. Can be a number (all corners) or an array `[TL, TR, BR, BL]`.
 * @param borderStyle - The `LineStyle` to use for the border stroke.
 */
function drawRoundRect(ctx, x, y, width, height, radius, borderStyle) {
    let r;
    if (Array.isArray(radius)) {
        // V3.8 had a [radiusX, radiusY] case for length 2, but for simplicity,
        // and to align with CSS-like standard, we'll map length 2 to [TR, TL, BR, BL] for now, or just map to all corners same if we consider x and y radius.
        // For now, let's assume if it's 2, it means [topLeftBottomRight, topRightBottomLeft]
        if (radius.length === 2) { // Assuming [top-left/bottom-right, top-right/bottom-left] or some interpretation
            r = [radius[0], radius[1], radius[0], radius[1]];
        }
        else if (radius.length === 4) {
            r = radius;
        }
        else {
            console.warn('Invalid radius array length. Expected 1, 2, or 4 elements. Defaulting to 0.');
            r = [0, 0, 0, 0]; // Invalid, revert to no radius
        }
    }
    else {
        r = [radius, radius, radius, radius];
    }
    drawPathRoundRect(ctx, x, y, width, height, r);
    setLineStyle(ctx, borderStyle);
    ctx.stroke();
}
/**
 * A comprehensive utility to draw a filled rectangle with an optional border, rounded corners, and infinite horizontal extensions.
 *
 * This function handles complex geometry, including:
 * - Normalizing coordinate bounds (min/max).
 * - Extending the rectangle to the edges of the container (left/right).
 * - Aligning the border stroke (inner, outer, or center) to ensure crisp pixel rendering.
 * - Filling and stroking with distinct colors and styles.
 *
 * @param ctx - The canvas rendering context.
 * @param point0 - The first defining point of the rectangle (any corner).
 * @param point1 - The second defining point of the rectangle (opposite corner).
 * @param backgroundColor - The fill color (optional).
 * @param borderColor - The stroke color (optional).
 * @param borderWidth - The width of the border stroke.
 * @param borderStyle - The `LineStyle` of the border.
 * @param radius - The corner radius (number or array of 4 numbers).
 * @param borderAlign - The alignment of the border relative to the path: `'inner'`, `'outer'`, or `'center'`.
 * @param extendLeft - If `true`, the rectangle extends infinitely to the left (x=0).
 * @param extendRight - If `true`, the rectangle extends infinitely to the right (x=containerWidth).
 * @param containerWidth - The total width of the drawing area (used for extension).
 */
function fillRectWithBorder(ctx, point0, point1, backgroundColor, borderColor, borderWidth = 0, borderStyle, radius, // NEW PARAMETER
borderAlign, extendLeft, extendRight, containerWidth // The actual width of the drawing area.
) {
    // FIX START: Geometric Normalization
    // Determine the true geometric bounds (Left/Right/Top/Bottom) regardless of point order.
    const minX = Math.min(point0.x, point1.x);
    const maxX = Math.max(point0.x, point1.x);
    const minY = Math.min(point0.y, point1.y);
    const maxY = Math.max(point0.y, point1.y);
    // Apply extensions to the geometric bounds
    const x1 = extendLeft ? 0 : minX;
    const x2 = extendRight ? containerWidth : maxX;
    const y1 = minY;
    // const y2 = maxY; // Not needed for drawing, used for height calculation
    const width = x2 - x1;
    const height = maxY - minY;
    // FIX END
    // Prepare radii for fill path
    let fillRadii;
    if (Array.isArray(radius)) {
        if (radius.length === 2) {
            fillRadii = [radius[0], radius[1], radius[0], radius[1]];
        }
        else if (radius.length === 4) {
            fillRadii = radius;
        }
        else {
            fillRadii = [0, 0, 0, 0];
        }
    }
    else {
        fillRadii = [radius, radius, radius, radius];
    }
    // Fill background
    if (backgroundColor !== undefined) {
        ctx.fillStyle = backgroundColor;
        // Use drawPathRoundRect for fill to support rounded corners
        drawPathRoundRect(ctx, x1, y1, width, height, fillRadii);
        ctx.fill();
    }
    // Draw border
    if (borderColor !== undefined && borderWidth > 0) {
        setLineStyle(ctx, borderStyle || LineStyle.Solid);
        let offsetLeft = 0;
        let offsetRight = 0;
        let offsetTop = 0;
        let offsetBottom = 0;
        switch (borderAlign) {
            case 'outer':
                offsetLeft = -borderWidth / 2;
                offsetRight = borderWidth / 2;
                offsetTop = -borderWidth / 2;
                offsetBottom = borderWidth / 2;
                break;
            case 'center':
                // Ensure pixel snapping for center-aligned borders
                offsetLeft = -borderWidth / 2;
                offsetRight = borderWidth / 2;
                offsetTop = -borderWidth / 2;
                offsetBottom = borderWidth / 2;
                break;
            case 'inner':
                offsetLeft = borderWidth / 2;
                offsetRight = -borderWidth / 2;
                offsetTop = borderWidth / 2;
                offsetBottom = -borderWidth / 2;
                break;
        }
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        // Use drawPathRoundRect for border stroke
        drawPathRoundRect(ctx, x1 + offsetLeft, y1 + offsetTop, width - offsetLeft + offsetRight, height - offsetTop + offsetBottom, fillRadii);
        ctx.stroke();
    }
}
// #endregion

// /src/utils/text-helpers.ts
/**
 * Internal constant defining a hard-coded minimum padding in pixels.
 *
 * This ensures that text does not bleed into the border or background edges,
 * providing a baseline "breathing room" regardless of user configuration.
 */
const MINIMUM_PADDING_PIXELS = 5;
/**
 * A shared, off-screen canvas context used strictly for text measurement operations.
 *
 * This prevents the overhead of creating a new canvas element every time text needs
 * to be measured or wrapped. It is initialized lazily via {@link createCacheCanvas}.
 */
let cacheCanvas = null; // Changed to null initially
/**
 * Lazily initializes the shared {@link cacheCanvas} if it does not already exist.
 *
 * It creates a 0x0 pixel canvas element (to minimize memory footprint) and retrieves
 * its 2D context. This function should be called before any operation requiring
 * `measureText`.
 */
function createCacheCanvas() {
    if (cacheCanvas === null) { // Only create if it doesn't exist
        const canvas = document.createElement('canvas');
        // Set width/height to 0 to minimize memory footprint for a purely offscreen canvas
        canvas.width = 0;
        canvas.height = 0;
        cacheCanvas = ensureNotNull(canvas.getContext('2d'));
    }
}
/**
 * Calculates the total width of the text box container.
 *
 * The width includes the widest line of text, plus scaled horizontal padding and
 * background inflation.
 *
 * @param data - The text renderer data containing box styling options.
 * @param maxLineWidth - The pixel width of the longest line of text.
 * @returns The total calculated width in pixels.
 */
function getBoxWidth(data, maxLineWidth) {
    return maxLineWidth + 2 * getScaledBackgroundInflationX(data) + 2 * getScaledBoxPaddingX(data);
}
/**
 * Calculates the total height of the text box container.
 *
 * The height accounts for the number of lines, font size, line spacing (padding between lines),
 * vertical box padding, and background inflation.
 *
 * @param data - The text renderer data containing box styling options.
 * @param linesCount - The number of text lines to render.
 * @returns The total calculated height in pixels.
 */
function getBoxHeight(data, linesCount) {
    const scaledFontSize = getScaledFontSize(data);
    const scaledPadding = getScaledPadding(data);
    // V3.8 computation for box height.
    // `scaledReading` (from v3.8 `text-renderer.ts`) corresponds to `scaledFontSize` here if reading is fontSize.
    // Total height = (numLines * effectiveLineHeight) + 2 * verticalPadding.
    // effectiveLineHeight = scaledFontSize + scaledPadding
    return scaledFontSize * linesCount + scaledPadding * (linesCount - 1) + 2 * getScaledBackgroundInflationY(data) + 2 * getScaledBoxPaddingY(data);
}
/**
 * Calculates the effective vertical padding for the text box.
 *
 * This combines the user-defined `text.box.padding.y` with the internal {@link MINIMUM_PADDING_PIXELS},
 * scaling the result based on the font-aware scale factor.
 *
 * @param data - The text renderer data.
 * @returns The final vertical padding in pixels.
 */
function getScaledBoxPaddingY(data) {
    // Read the user-defined value, defaulting to 0 if unset
    const userDefinedPadding = data.text?.box?.padding?.y || 0;
    // Calculate user's scaled padding
    // Note: If data.text?.box?.padding?.y was explicitly set to 0 in options, it will be 0.
    const scaledUserPadding = userDefinedPadding * getFontAwareScale(data);
    // Add the scaled user padding to the MINIMUM_PADDING_PIXELS
    // This ensures the minimum is always present, and the user's padding is additive.
    return scaledUserPadding + MINIMUM_PADDING_PIXELS;
}
/**
 * Calculates the effective horizontal padding for the text box.
 *
 * This combines the user-defined `text.box.padding.x` with the internal {@link MINIMUM_PADDING_PIXELS},
 * scaling the result based on the font-aware scale factor.
 *
 * @param data - The text renderer data.
 * @returns The final horizontal padding in pixels.
 */
function getScaledBoxPaddingX(data) {
    // Read the user-defined value, defaulting to 0 if unset
    const userDefinedPadding = data.text?.box?.padding?.x || 0;
    // Calculate user's scaled padding
    const scaledUserPadding = userDefinedPadding * getFontAwareScale(data);
    // Add the scaled user padding to the MINIMUM_PADDING_PIXELS
    return scaledUserPadding + MINIMUM_PADDING_PIXELS;
}
/**
 * Calculates the vertical inflation (expansion) of the background rectangle.
 *
 * Inflation allows the background color to extend beyond the logical bounds of the text box
 * without affecting layout positioning.
 *
 * @param data - The text renderer data.
 * @returns The scaled vertical inflation in pixels.
 */
function getScaledBackgroundInflationY(data) {
    return (data.text?.box?.background?.inflation?.y || 0) * getFontAwareScale(data);
}
/**
 * Calculates the horizontal inflation (expansion) of the background rectangle.
 *
 * @param data - The text renderer data.
 * @returns The scaled horizontal inflation in pixels.
 */
function getScaledBackgroundInflationX(data) {
    return (data.text?.box?.background?.inflation?.x || 0) * getFontAwareScale(data);
}
/**
 * Calculates the scaled padding value used for line spacing.
 *
 * This value determines the gap between multiple lines of text.
 *
 * @param data - The text renderer data.
 * @returns The scaled padding in pixels.
 */
function getScaledPadding(data) {
    return (data.text?.padding || 0) * getFontAwareScale(data);
}
/**
 * Calculates the final font size in pixels to use for rendering.
 *
 * This takes the base font size and multiplies it by the calculated font-aware scale factor.
 *
 * @param data - The text renderer data.
 * @returns The scaled font size, rounded up to the nearest integer.
 */
function getScaledFontSize(data) {
    return Math.ceil(getFontSize(data) * getFontAwareScale(data));
}
/**
 * Retrieves the base font size from the renderer options.
 *
 * If no font size is specified in `data.text.font.size`, it defaults to 30 pixels.
 *
 * @param data - The text renderer data.
 * @returns The base font size in pixels.
 */
function getFontSize(data) {
    return data.text?.font?.size || 30; // Default font size from V3.8
}
/**
 * Calculates a normalization scale factor.
 *
 * This combines the user-defined `text.box.scale` with an adjustment based on the font size
 * to ensure consistent rendering across different resolutions or zoom levels.
 * It enforces a minimum scale of 0.01 to prevent mathematical errors.
 *
 * @param data - The text renderer data.
 * @returns The effective scale factor.
 */
function getFontAwareScale(data) {
    // Note: We keep a lower clamp like 0.01 to prevent division by zero or negative/zero scale.
    const scale = Math.max(0.01, data.text?.box?.scale || 1);
    // If the effective scale is 1, return it early to prevent unnecessary calculations.
    if (scale === 1) {
        return scale;
    }
    // The rest of the calculation is sound:
    const fontSize = getFontSize(data);
    return Math.ceil(scale * fontSize) / fontSize;
}
/**
 * Detects if the current document is in Right-to-Left (RTL) mode.
 *
 * It checks `window.document.dir` for the value `'rtl'`. This is used to adjust
 * text alignment defaults (e.g., aligning text to the right by default in RTL contexts).
 *
 * @returns `true` if the document direction is RTL, `false` otherwise.
 */
function isRtl() {
    // Uses DOM property to detect right-to-left language direction
    return typeof window !== 'undefined' && 'rtl' === window.document.dir;
}
/**
 * Performs sophisticated word wrapping on a string based on a maximum pixel width.
 *
 * This function:
 * 1. Respects existing newlines (`\n`).
 * 2. Measures text using an off-screen canvas.
 * 3. Wraps lines that exceed `lineWrapWidth`.
 * 4. Breaks individual words if they are wider than the wrap width.
 *
 * @param text - The input text string.
 * @param font - The CSS font string used for measurement.
 * @param lineWrapWidth - The maximum width in pixels for a single line.
 * @returns An array of strings, where each element is a single visual line.
 */
function textWrap(text, font, lineWrapWidth) {
    createCacheCanvas(); // Ensure canvas is created before measuring text
    const ctx = ensureNotNull(cacheCanvas); // Get the context
    // Convert lineWrapWidth to a number if it's a string, or handle undefined/null
    let wrapWidthNum;
    if (typeof lineWrapWidth === 'string') {
        wrapWidthNum = parseInt(lineWrapWidth);
    }
    else if (typeof lineWrapWidth === 'number') {
        wrapWidthNum = lineWrapWidth;
    }
    else {
        wrapWidthNum = 0; // Default to no wrapping if not specified
    }
    // Split text by newlines first
    text += ''; // Ensure text is a string
    const lines = !Number.isInteger(wrapWidthNum) || !isFinite(wrapWidthNum) || wrapWidthNum <= 0
        ? text.split(/\r\n|\r|\n|$/) // Split only by newlines if no wrap width
        : text.split(/[^\S\r\n]*(?:\r\n|\r|\n|$)/); // Split by newlines and spaces for wrapping
    if (lines.length > 0 && !lines[lines.length - 1]) {
        lines.pop();
    } // Remove empty last line if exists
    // If no valid wrapWidth, return lines as-is
    if (!Number.isInteger(wrapWidthNum) || !isFinite(wrapWidthNum) || wrapWidthNum <= 0) {
        return lines;
    }
    ctx.font = font; // Set font for accurate measurement
    const wrappedLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWidth = ctx.measureText(line).width;
        if (lineWidth <= wrapWidthNum) {
            wrappedLines.push(line);
            continue;
        }
        // Complex word-splitting logic (as per V3.8)
        const splitWordsAndSeparators = line.split(/([-)\]},.!?:;])|(\s+)/); // Split by punctuation and spaces
        const currentLineWords = [];
        let currentLineWidth = 0;
        for (let j = 0; j < splitWordsAndSeparators.length; j++) {
            const segment = splitWordsAndSeparators[j];
            if (segment === undefined || segment === '')
                continue;
            const segmentWidth = ctx.measureText(segment).width;
            if (currentLineWidth + segmentWidth <= wrapWidthNum) {
                currentLineWords.push(segment);
                currentLineWidth += segmentWidth;
            }
            else {
                if (currentLineWords.length > 0) {
                    wrappedLines.push(currentLineWords.join(''));
                    currentLineWords.length = 0;
                    currentLineWidth = 0;
                }
                // If a single word is too long, or it's the start of a new line
                // we need to break the word itself (character by character)
                if (segmentWidth > wrapWidthNum) {
                    let tempWord = '';
                    for (let k = 0; k < segment.length; k++) {
                        const char = segment[k];
                        const charWidth = ctx.measureText(char).width;
                        if (currentLineWidth + charWidth <= wrapWidthNum) {
                            tempWord += char;
                            currentLineWidth += charWidth;
                        }
                        else {
                            if (tempWord.length > 0) {
                                wrappedLines.push(tempWord);
                            }
                            tempWord = char;
                            currentLineWidth = charWidth;
                        }
                    }
                    if (tempWord.length > 0) {
                        currentLineWords.push(tempWord);
                        currentLineWidth = ctx.measureText(tempWord).width; // Recalculate width for the part of word pushed
                    }
                }
                else {
                    currentLineWords.push(segment);
                    currentLineWidth += segmentWidth;
                }
            }
        }
        if (currentLineWords.length > 0) {
            wrappedLines.push(currentLineWords.join(''));
        }
    }
    return wrappedLines;
}
/**
 * Checks if a CSS color string represents a completely transparent color.
 *
 * It detects:
 * - The keyword `'transparent'`.
 * - `rgba(...)` strings where alpha is 0.
 * - `hsla(...)` strings where alpha is 0.
 *
 * @param color - The CSS color string to test.
 * @returns `true` if the color is fully transparent, `false` if opaque or translucent.
 */
function isFullyTransparent(color) {
    // Add defensive check for undefined/null input before operating on the string.
    if (typeof color !== 'string') {
        return false; // Treat non-strings (undefined/null) as non-transparent (or skip the check)
    }
    color = color.toLowerCase().trim();
    if (color === 'transparent') {
        return true;
    }
    // Regex to extract the alpha value from rgba(r,g,b,a) or hsla(h,s,l,a)
    // Matches numbers after the last comma inside rgba()/hsla()
    const alphaRegex = /(?:rgba|hsla)\((?:\s*\d+\s*,){3}\s*(\d*\.?\d+)\s*\)/;
    const match = color.match(alphaRegex);
    if (match && match[1]) {
        const alpha = parseFloat(match[1]);
        return alpha === 0;
    }
    // If it's a hex, rgb, hsl, or named color without alpha, it's considered opaque (not transparent)
    return false;
}

// /src/utils/culling-helpers.ts
// #region Types
/**
 * Enum defining the visibility state of a tool relative to the chart's current viewport.
 *
 * These values are used by the rendering engine to determine if a tool should be drawn (`Visible`)
 * or skipped. If skipped, specific off-screen values (`OffScreenTop`, `OffScreenLeft`, etc.)
 * provide hints about *where* the tool is located, which can be used for directional indicators.
 */
var OffScreenState;
(function (OffScreenState) {
    OffScreenState["Visible"] = "visible";
    OffScreenState["OffScreenTop"] = "top";
    OffScreenState["OffScreenBottom"] = "bottom";
    OffScreenState["OffScreenLeft"] = "left";
    OffScreenState["OffScreenRight"] = "right";
    OffScreenState["FullyOffScreen"] = "fullyOffScreen";
})(OffScreenState || (OffScreenState = {}));
// #endregion Types
/**
 * Calculates the Axis-Aligned Bounding Box (AABB) for a set of tool points.
 *
 * This iterates through all provided points to find the min/max timestamp and price.
 * It is used for fast exclusion checks before performing more expensive geometric clipping.
 *
 * @param points - An array of {@link LineToolPoint}s defining the tool.
 * @returns A {@link ToolBoundingBox} representing the extents, or `null` if the array is empty.
 */
function getToolBoundingBox(points) {
    if (points.length === 0)
        return null;
    let minTime = points[0].timestamp;
    let maxTime = points[0].timestamp;
    let minPrice = points[0].price;
    let maxPrice = points[0].price;
    for (const point of points) {
        minTime = Math.min(minTime, point.timestamp);
        maxTime = Math.max(maxTime, point.timestamp);
        minPrice = Math.min(minPrice, point.price);
        maxPrice = Math.max(maxPrice, point.price);
    }
    // NOTE: This now returns an AABB in Time/Price space.
    return { minTime, maxTime, minPrice, maxPrice };
}
/**
 * Calculates the bounding box of the currently visible chart area in logical units (Timestamp/Price).
 *
 * This function handles the complex logic of mapping the viewport's pixel dimensions back to
 * time and price ranges. Crucially, it uses **interpolation** to determine the timestamp values for
 * the left and right edges of the screen, ensuring accurate bounds even when the user scrolls
 * into the "blank" future space where no data bars exist.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 * @param tool - The tool instance (used to access the chart, series, and scale APIs).
 * @returns A {@link ToolBoundingBox} representing the visible area, or `null` if the chart is not ready.
 */
function getViewportBounds(tool) {
    const chart = tool.getChart();
    const series = tool.getSeries();
    const timeScale = chart.timeScale();
    // 1. Get Extended Price Range
    const priceRangeResult = getExtendedVisiblePriceRange(tool);
    if (!priceRangeResult || priceRangeResult.from === null || priceRangeResult.to === null) {
        return null;
    }
    //console.groupCollapsed('%c[VIEWPORT DEBUG] Start getViewportBounds (Forced Interpolation Fix)', 'color: #32CD32; font-weight: bold;');
    const logicalRange = timeScale.getVisibleLogicalRange();
    if (!logicalRange) {
        //console.log("Logical Range is null. Exiting.");
        //console.groupEnd();
        return null;
    }
    //console.log(`Initial Logical Range: [${logicalRange.from.toFixed(2)}, ${logicalRange.to.toFixed(2)}]`);
    // BUFFER: Widen by large amount to prevent culling on TF change
    const BUFFER = 500;
    const leftLogical = (logicalRange.from - BUFFER);
    const rightLogical = (logicalRange.to + BUFFER);
    //console.log(`Buffered Logical Range (Target Indices): [${leftLogical.toFixed(2)}, ${rightLogical.toFixed(2)}]`);
    // --- Time Bounds Calculation: FORCED INTERPOLATION FIX ---
    // Problem: coordinateToTime caps the MaxTime value in the blank space.
    // Fix: Rely on interpolateTimeFromLogicalIndex for continuity across the blank space.
    const rawMinTime = interpolateTimeFromLogicalIndex(chart, series, leftLogical);
    const rawMaxTime = interpolateTimeFromLogicalIndex(chart, series, rightLogical);
    //console.log(`%cInterpolation Raw Results: MinTime=${rawMinTime} | MaxTime=${rawMaxTime}`, 'color: #FF8C00; font-weight: bold;');
    if (rawMinTime === null || rawMaxTime === null) {
        //console.log("Interpolation returned null for one or both sides. Exiting.");
        //console.groupEnd();
        return null;
    }
    const minTimeNum = Number(rawMinTime);
    const maxTimeNum = Number(rawMaxTime);
    // Apply rounding for integer consistency (narrower viewport)
    let minTime = Math.ceil(minTimeNum);
    let maxTime = Math.floor(maxTimeNum);
    //console.log(`Initial Final Time (Rounded): [${minTime}, ${maxTime}]`);
    // Degeneracy Check (Ensure a valid time range of at least 1 unit)
    if (minTime >= maxTime) {
        //console.log(`%cDegeneracy Detected (minTime >= maxTime). Adjusting maxTime.`, 'color: #FF4500;');
        maxTime = minTime + 1;
    }
    // --- Price Bounds Calculation (Remains Unchanged) ---
    const minPriceRaw = Math.min(priceRangeResult.from, priceRangeResult.to);
    const maxPriceRaw = Math.max(priceRangeResult.from, priceRangeResult.to);
    const viewportBounds = {
        minTime: minTime,
        maxTime: maxTime,
        minPrice: minPriceRaw,
        maxPrice: maxPriceRaw,
    };
    //console.log(`%cFINAL VIEWPORT BOUNDS: MinTime=${viewportBounds.minTime}, MaxTime=${viewportBounds.maxTime}`, 'color: #3CB371; font-weight: bold;');
    //console.groupEnd();
    return viewportBounds;
}
// #endregion Universal Bounding Box Calculators
// #region Main Culling State Helper (Instrumented)
/**
 * Internal geometric helper that computes the culling state for two-point tools with potential infinite extensions.
 *
 * This function determines if a line segment (or Ray/Infinite Line defined by `extendOptions`) intersects
 * the visible viewport. It normalizes point order, performs parametric clipping against the viewport bounds,
 * and falls back to a full AABB check if the line misses the viewport entirely to provide a directional hint.
 *
 * @param points - An array of exactly two {@link LineToolPoint}s.
 * @param viewportBounds - The bounding box of the visible chart area.
 * @param extendOptions - Configuration defining if the line extends infinitely to the left or right.
 * @returns The {@link OffScreenState} indicating visibility or direction of the miss.
 */
function getCullingStateWithExtensions(points, viewportBounds, extendOptions) {
    // NEW: Check for degenerate viewport time (minTime === maxTime — e.g., extreme zoom/single bar)
    viewportBounds.minTime === viewportBounds.maxTime;
    // --- FIX #1: NORMALIZE POINT ORDER ---
    // Ensure p1 is always the point with the earlier timestamp.
    // This makes the parametric space 't' consistent with time's direction.
    let p1;
    let p2;
    points[0];
    points[1];
    if (points[0].timestamp > points[1].timestamp) {
        p1 = points[1];
        p2 = points[0];
    }
    else {
        p1 = points[0];
        p2 = points[1];
    }
    // 1. Find the visible parametric range [t_enter, t_exit] of the INFINITE line.
    // This function now receives points in a consistent order.
    const [t_enter, t_exit] = calculateInfiniteLineClip(p1, p2, viewportBounds);
    // 2. Geometric Miss: If t_enter > t_exit, the infinite line never enters the viewport.
    if (t_enter > t_exit) {
        const toolBounds = getToolBoundingBox(points);
        // --- FIX #2: FULL AABB CHECK ON MISS ---
        // Provide a complete and accurate directional hint.
        if (toolBounds.minPrice > viewportBounds.maxPrice) {
            return OffScreenState.OffScreenTop;
        }
        if (toolBounds.maxPrice < viewportBounds.minPrice) {
            return OffScreenState.OffScreenBottom;
        }
        if (toolBounds.maxTime < viewportBounds.minTime) {
            return OffScreenState.OffScreenLeft;
        }
        if (toolBounds.minTime > viewportBounds.maxTime) {
            return OffScreenState.OffScreenRight;
        }
        return OffScreenState.FullyOffScreen;
    }
    // 3. Define the tool's actual path as a parametric range [t_start, t_end].
    // Because of normalization, 'left' (t<0) and 'right' (t>1) are now always correct.
    const t_start = extendOptions.left ? -Infinity : 0;
    const t_end = extendOptions.right ? Infinity : 1;
    // 4. Final Overlap Check: Does the tool's path overlap with the visible line segment?
    const overlap_start = Math.max(t_start, t_enter);
    const overlap_end = Math.min(t_end, t_exit);
    // If the overlap range is valid (start <= end), the tool is visible.
    if (overlap_start <= overlap_end) {
        return OffScreenState.Visible;
    }
    // 5. No Overlap: The specific tool path (e.g., a ray) misses the visible area.
    // We can safely cull. Use the full AABB check for a directional hint.
    const toolBounds = getToolBoundingBox(points);
    // --- FIX #2 (Applied here as well for consistency) ---
    if (toolBounds.minPrice > viewportBounds.maxPrice) {
        return OffScreenState.OffScreenTop;
    }
    if (toolBounds.maxPrice < viewportBounds.minPrice) {
        return OffScreenState.OffScreenBottom;
    }
    if (toolBounds.maxTime < viewportBounds.minTime) {
        return OffScreenState.OffScreenLeft;
    }
    if (toolBounds.minTime > viewportBounds.maxTime) {
        return OffScreenState.OffScreenRight;
    }
    return OffScreenState.FullyOffScreen;
}
/**
 * Internal helper implementing a slab-clipping algorithm (similar to Cohen-Sutherland) to clip an infinite line against the viewport.
 *
 * It calculates the parametric interval `[t_enter, t_exit]` where the infinite line defined by `p1` and `p2`
 * lies inside the `viewport`.
 * - Clips sequentially against vertical (time) and horizontal (price) slabs.
 * - Handles degenerate cases (vertical/horizontal lines) robustly.
 * - Returns `[Infinity, -Infinity]` if the line misses the viewport entirely.
 *
 * @param p1 - The starting point (t=0).
 * @param p2 - The ending point (t=1).
 * @param viewport - The bounding box of the viewport.
 * @returns A tuple `[t_enter, t_exit]` representing the visible segment in parametric space.
 */
function calculateInfiniteLineClip(p1, p2, viewport) {
    // NEW: Check for degenerate viewport time (minTime === maxTime — e.g., extreme zoom/single bar)
    const timeDegenerate = viewport.minTime === viewport.maxTime;
    const dx = p2.timestamp - p1.timestamp;
    const dy = p2.price - p1.price;
    let t_enter = -Infinity;
    let t_exit = Infinity;
    // --- 1. Clip against Vertical (Time) Slab ---
    // Handle vertical lines (parallel to price axis)
    if (dx === 0) {
        // If the vertical line is outside the viewport's horizontal bounds, it's a guaranteed miss.
        if (p1.timestamp < viewport.minTime || p1.timestamp > viewport.maxTime) {
            return [Infinity, -Infinity]; // RETURN MISS
        }
        // Otherwise, this line spans the entire viewport vertically. The time slab
        // imposes no constraint on 't', so we proceed to the price slab check.
    }
    else {
        // NEW: Handle degenerate time slab (minTime === maxTime — treat as point slab)
        if (timeDegenerate) {
            const t_single = (viewport.minTime - p1.timestamp) / dx;
            t_enter = Math.max(t_enter, t_single);
            t_exit = Math.min(t_exit, t_single);
        }
        else {
            let t1 = (viewport.minTime - p1.timestamp) / dx;
            let t2 = (viewport.maxTime - p1.timestamp) / dx;
            // Sort t1 and t2 so t1 is always the entry and t2 is the exit of the slab
            if (t1 > t2) {
                [t1, t2] = [t2, t1];
            }
            // Update the master interval
            t_enter = Math.max(t_enter, t1);
            t_exit = Math.min(t_exit, t2);
        }
    }
    // --- 2. Clip against Horizontal (Price) Slab ---
    // Handle horizontal lines (parallel to time axis)
    if (dy === 0) {
        // If the horizontal line is outside the viewport's vertical bounds, it's a guaranteed miss.
        if (p1.price < viewport.minPrice || p1.price > viewport.maxPrice) {
            return [Infinity, -Infinity]; // RETURN MISS
        }
        // Otherwise, we proceed. The price slab imposes no constraint on 't'.
    }
    else {
        let t1 = (viewport.minPrice - p1.price) / dy;
        let t2 = (viewport.maxPrice - p1.price) / dy;
        // Sort t1 and t2
        if (t1 > t2) {
            [t1, t2] = [t2, t1];
        }
        // Update the master interval
        t_enter = Math.max(t_enter, t1);
        t_exit = Math.min(t_exit, t2);
    }
    // --- 3. Final Check ---
    // If, after all clipping, the interval is invalid, it's a miss.
    if (t_enter > t_exit) {
        return [Infinity, -Infinity];
    }
    return [t_enter, t_exit];
}
/**
 * The primary culling engine entry point. Determines the precise off-screen state of any tool.
 *
 * This function routes logic based on the tool's geometry:
 * 1. **Complex Shapes**: Uses `cullingInfo` to check specific sub-segments (e.g., for Polylines).
 * 2. **Single Points**: Performs point-in-AABB checks or specific horizontal/vertical line logic if extensions are active.
 * 3. **Two-Point Tools**: Uses robust geometric clipping (via {@link getCullingStateWithExtensions}) to handle segments, rays, and infinite lines.
 * 4. **General Fallback**: Uses a standard AABB overlap check for other cases.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 * @param points - The points defining the tool.
 * @param tool - The tool instance.
 * @param extendOptions - Optional configuration for infinite extensions (Left/Right).
 * @param singlePointOrientation - Optional orientation for single-point infinite lines (Horizontal/Vertical).
 * @param cullingInfo - Optional advanced culling rules (e.g., `subSegments` for multi-segment tools).
 * @returns The final {@link OffScreenState} (Visible, or a specific directional miss).
 */
function getToolCullingState(points, tool, extendOptions, singlePointOrientation, cullingInfo) {
    // --- Fast Path: Triage ---
    if (points.length === 0) {
        return OffScreenState.FullyOffScreen;
    }
    const viewportBounds = getViewportBounds(tool);
    if (!viewportBounds) {
        return OffScreenState.Visible; // Fail safe if viewport isn't available
    }
    // Determine if general extensions are active
    const hasExtensions = extendOptions && (extendOptions.left || extendOptions.right); // Retained original logic
    // --- Local Helper for Two-Point Check (Returns OffScreenState) ---
    const callTwoPointCuller = (pA, pB, extend) => {
        // NOTE: getCullingStateWithExtensions is defined earlier in this file.
        return getCullingStateWithExtensions([pA, pB], viewportBounds, extend);
    };
    // --- NEW LOGIC: SUB-SEGMENT CULLING CHECK (Highest Priority for Complex Shapes with Culling Info) ---
    // This logic executes for multi-point shapes (length >= 3) where culling rules are provided.
    if (points.length >= 3 && cullingInfo?.subSegments && extendOptions) {
        let isAnySegmentVisible = false;
        for (const [indexA, indexB] of cullingInfo.subSegments) {
            // Ensure indices are valid and points exist
            if (points[indexA] && points[indexB]) {
                // If the culler returns Visible, the whole tool is visible.
                if (callTwoPointCuller(points[indexA], points[indexB], extendOptions) === OffScreenState.Visible) {
                    isAnySegmentVisible = true;
                    break; // Found a visible segment, no need to check others
                }
            }
        }
        // Final Culling Decision for Sub-Segments:
        if (isAnySegmentVisible) {
            return OffScreenState.Visible;
        }
        else {
            // If all specified sub-segments are invisible, the tool is fully off-screen/culled.
            return OffScreenState.FullyOffScreen;
        }
    }
    // --- Existing Logic Resumes: Handle 1-point and simple 2-point cases ---
    // Case 1: One point tool
    if (points.length === 1) {
        const p = points[0];
        const isLeftActive = extendOptions?.left ?? false;
        const isRightActive = extendOptions?.right ?? false;
        const orientation = singlePointOrientation;
        // Check if we need to perform the robust line checks, or just the simple point check.
        const isHorizontalLineActive = hasExtensions && (orientation?.horizontal ?? false);
        const isVerticalLineActive = hasExtensions && (orientation?.vertical ?? false);
        // --- Sub-Case: Single Point AABB Check (No active line components) ---
        // Condition: No extensions OR extensions are active but neither orientation is enabled.
        if (!isHorizontalLineActive && !isVerticalLineActive) {
            // Treat as a single point (AABB check only)
            // Is the point inside the viewport?
            if (p.timestamp >= viewportBounds.minTime && p.timestamp <= viewportBounds.maxTime &&
                p.price >= viewportBounds.minPrice && p.price <= viewportBounds.maxPrice) {
                return OffScreenState.Visible;
            }
            // Point is off-screen. Provide a directional hint based on AABB.
            if (p.price > viewportBounds.maxPrice)
                return OffScreenState.OffScreenTop;
            if (p.price < viewportBounds.minPrice)
                return OffScreenState.OffScreenBottom;
            if (p.timestamp < viewportBounds.minTime)
                return OffScreenState.OffScreenLeft;
            if (p.timestamp > viewportBounds.maxTime)
                return OffScreenState.OffScreenRight;
            return OffScreenState.FullyOffScreen;
        }
        // --- Sub-Case: Robust Line Check (Horizontal/Vertical Line Logic) ---
        let isToolVisible = false;
        // -----------------------------------------------------------
        // A. Horizontal Line Check (Price Level)
        // -----------------------------------------------------------
        if (isHorizontalLineActive) {
            // 1. Vertical Check (Strongest Miss Signal)
            const isAlignedVertically = (p.price >= viewportBounds.minPrice && p.price <= viewportBounds.maxPrice);
            if (isAlignedVertically) {
                // 2. Horizontal Check (Visibility by Intersection)
                // Left Ray (Visible if active AND point is not past the viewport's left edge)
                if (isLeftActive && p.timestamp >= viewportBounds.minTime) {
                    isToolVisible = true;
                }
                // Right Ray (Visible if active AND point is not past the viewport's right edge)
                if (isRightActive && p.timestamp <= viewportBounds.maxTime) {
                    isToolVisible = true;
                }
            }
        }
        // -----------------------------------------------------------
        // B. Vertical Line Check (Time Level)
        // -----------------------------------------------------------
        if (isVerticalLineActive) {
            // 1. Horizontal Check (Time Level)
            const isAlignedHorizontally = (p.timestamp >= viewportBounds.minTime && p.timestamp <= viewportBounds.maxTime);
            if (isAlignedHorizontally) {
                // If it's horizontally aligned, it is guaranteed to intersect the viewport
                isToolVisible = true;
            }
        }
        // Final Visibility Decision: If EITHER line is visible, the tool is visible.
        if (isToolVisible) {
            return OffScreenState.Visible;
        }
        // -----------------------------------------------------------
        // C. Directional Miss (Both active lines missed)
        // -----------------------------------------------------------
        // If we reached here, the tool is not visible. We must provide the most accurate directional hint.
        // We check the single point's AABB position.
        if (p.price > viewportBounds.maxPrice)
            return OffScreenState.OffScreenTop;
        if (p.price < viewportBounds.minPrice)
            return OffScreenState.OffScreenBottom;
        if (p.timestamp < viewportBounds.minTime)
            return OffScreenState.OffScreenLeft;
        if (p.timestamp > viewportBounds.maxTime)
            return OffScreenState.OffScreenRight;
        return OffScreenState.FullyOffScreen;
    }
    // Case 2: Two points.
    if (points.length === 2) {
        // No extensions: Use fast AABB check.
        if (!hasExtensions) {
            const toolBounds = getToolBoundingBox(points);
            if (!toolBounds)
                return OffScreenState.Visible; // Should not happen if points.length > 0
            // Standard AABB culling
            if (toolBounds.minPrice > viewportBounds.maxPrice)
                return OffScreenState.OffScreenTop;
            if (toolBounds.maxPrice < viewportBounds.minPrice)
                return OffScreenState.OffScreenBottom;
            if (toolBounds.maxTime < viewportBounds.minTime)
                return OffScreenState.OffScreenLeft;
            if (toolBounds.minTime > viewportBounds.maxTime)
                return OffScreenState.OffScreenRight;
            return OffScreenState.Visible;
        }
        // With extensions: This requires the robust geometric check.
        return callTwoPointCuller(points[0], points[1], extendOptions); // <<< Use the local helper
    }
    // --- Fallback for Multi-Point Tools (Length >= 3, No Culling Info Provided) ---
    // This is the default AABB check for all tools that do not fit the above categories (e.g., 3+ points).
    const toolBounds = getToolBoundingBox(points);
    if (!toolBounds)
        return OffScreenState.Visible;
    // Standard AABB culling
    if (toolBounds.minPrice > viewportBounds.maxPrice)
        return OffScreenState.OffScreenTop;
    if (toolBounds.maxPrice < viewportBounds.minPrice)
        return OffScreenState.OffScreenBottom;
    if (toolBounds.maxTime < viewportBounds.minTime)
        return OffScreenState.OffScreenLeft;
    if (toolBounds.minTime > viewportBounds.maxTime)
        return OffScreenState.OffScreenRight;
    return OffScreenState.Visible;
}
// #endregion Main Culling State Helper

// /src/model/data-source.ts
/**
 * An abstract base class that implements the minimal required structure of a Lightweight Charts `IDataSource`.
 *
 * This class provides basic functionality for managing the price scale reference and Z-order (layering)
 * of any primitive. It is intended to be the top layer of inheritance for primitives that render data
 * (e.g., `PriceDataSource` and ultimately `BaseLineTool`).
 *
 * It leaves key rendering and data methods (like `autoscaleInfo` and `paneViews`) as abstract.
 */
class DataSource {
    constructor() {
        /**
         * The API instance for the price scale this data source is currently bound to.
         * This can be the default price scale or a custom one.
         * @protected
         */
        this._priceScale = null;
        this._zorder = 0;
    }
    /**
     * Retrieves the current Z-order value, which determines the drawing layer of the tool's primitive.
     * @returns The Z-order index.
     */
    zorder() {
        return this._zorder;
    }
    /**
     * Sets the drawing layer of the tool's primitive.
     * @param zorder - The new Z-order index.
     * @returns void
     */
    setZorder(zorder) {
        this._zorder = zorder;
    }
    /**
     * Retrieves the API for the price scale this primitive is attached to.
     * @returns The `IPriceScaleApi` instance, or `null`.
     */
    priceScale() {
        return this._priceScale;
    }
    /**
     * Sets the API instance for the price scale.
     * @param priceScale - The `IPriceScaleApi` instance, or `null` to clear.
     * @returns void
     */
    setPriceScale(priceScale) {
        this._priceScale = priceScale;
    }
    /**
     * Checks if the data source is visible.
     * @returns Always returns `true` by default, but derived classes can override.
     */
    visible() {
        return true;
    }
    /**
     * Provides an array of views for labels drawn in the pane (not used by default).
     * @returns An empty array.
     */
    labelPaneViews() {
        return [];
    }
    /**
     * Provides an array of views for drawing content above the series data (not used by default).
     * @returns An empty array.
     */
    topPaneViews() {
        return [];
    }
}

// /src/model/price-data-source.ts
/**
 * An abstract class that extends the minimal {@link DataSource} and enforces the required
 * IDataSource contract for primitives that rely on chart and price model information.
 *
 * This class provides a required reference to the `IChartApiBase` instance and is the
 * immediate parent for {@link BaseLineTool}.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item (e.g., `Time` or `number`).
 */
class PriceDataSource extends DataSource {
    /**
     * Initializes the data source by storing the reference to the chart model.
     *
     * @param model - The `IChartApiBase` instance.
     */
    constructor(model) {
        super();
        this._model = model;
    }
    /**
     * Retrieves the chart model API instance.
     *
     * This implements the abstract `IDataSource.model()` contract.
     *
     * @returns The `IChartApiBase` instance.
     */
    model() {
        return this._model;
    }
}

// /src/rendering/price-axis-view-renderer.ts
/**
 * The concrete implementation of a renderer responsible for drawing labels on the Price Axis.
 *
 * This class handles the pixel-level details of drawing the label's background box, border, text,
 * and tick mark according to the provided data and options, correctly accounting for LWC's rendering context.
 */
class PriceAxisViewRenderer {
    /**
     * Initializes the renderer with the initial data payloads.
     *
     * @param data - The {@link PriceAxisViewRendererData} containing the text and visibility flags.
     * @param commonData - The {@link PriceAxisViewRendererCommonData} containing coordinate and base style information.
     */
    constructor(data, commonData) {
        this.setData(data, commonData);
    }
    /**
     * Updates the data used by the renderer.
     *
     * @param data - The new {@link PriceAxisViewRendererData}.
     * @param commonData - The new {@link PriceAxisViewRendererCommonData}.
     * @returns void
     */
    setData(data, commonData) {
        this._data = data;
        this._commonData = commonData;
    }
    /**
     * Draws the price axis label onto the canvas.
     *
     * This method calculates the final layout, applies pixel snapping, draws the background/border/tick mark,
     * and renders the text based on the provided alignment ('left'/'right').
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @param rendererOptions - The {@link PriceAxisViewRendererOptions} for styling and dimensions.
     * @param textWidthCache - The {@link TextWidthCache} for accurate text measurement.
     * @param width - The total width of the Price Axis area in pixels.
     * @param align - The horizontal alignment of the axis ('left' for right scale, 'right' for left scale).
     * @returns void
     */
    draw(target, // Now directly accepting CanvasRenderingTarget2D
    rendererOptions, textWidthCache, width, align) {
        if (!this._data.visible) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            // pixelRatio is 1.0 in media coordinates if drawn directly.
            // If internal logic requires pixelRatio explicitly, we can derive it from mediaSize.
            const pixelRatio = mediaSize.width / width; // Derive pixelRatio for internal v3.8-like calc
            ctx.font = rendererOptions.font;
            const tickSize = (this._data.tickVisible || !this._data.moveTextToInvisibleTick) ? rendererOptions.tickLength : 0;
            const horzBorder = rendererOptions.borderSize;
            const paddingTop = rendererOptions.paddingTop;
            const paddingBottom = rendererOptions.paddingBottom;
            const paddingInner = rendererOptions.paddingInner;
            const paddingOuter = rendererOptions.paddingOuter;
            const text = this._data.text;
            // Measure text width directly, scaling only if intermediate calculations require it
            const textWidth = Math.ceil(textWidthCache.measureText(ctx, text));
            const baselineOffset = rendererOptions.baselineOffset;
            const totalHeight = rendererOptions.fontSize + paddingTop + paddingBottom;
            const halfHeight = Math.ceil(totalHeight * 0.5);
            const totalWidth = horzBorder + textWidth + paddingInner + paddingOuter + tickSize;
            let yMid = this._commonData.coordinate;
            if (this._commonData.fixedCoordinate) {
                yMid = this._commonData.fixedCoordinate;
            }
            yMid = Math.round(yMid);
            const yTop = yMid - halfHeight;
            const yBottom = yTop + totalHeight;
            const alignRight = align === 'right';
            const xInside = alignRight ? width : 0;
            // No longer need rightScaled as we are in media coordinates
            let xOutside = xInside;
            let xTick;
            let xText;
            ctx.lineWidth = 1; // Always 1 for drawing thin lines
            ctx.lineCap = 'butt';
            if (text) {
                if (alignRight) {
                    // 2               1
                    //
                    //              6  5
                    //
                    // 3               4
                    xOutside = xInside - totalWidth;
                    xTick = xInside - tickSize;
                    xText = xOutside + paddingOuter;
                }
                else {
                    // 1               2
                    //
                    // 6  5
                    //
                    // 4               3
                    xOutside = xInside + totalWidth;
                    xTick = xInside + tickSize;
                    xText = xInside + horzBorder + tickSize + paddingInner;
                }
                const tickHeight = pixelRatio >= 1 ? 1 : 0.5; // Always 1 media pixel for tick height
                const horzBorderMedia = horzBorder; // No explicit scaling multiplication for drawing
                const xInsideMedia = alignRight ? width : 0;
                const yTopMedia = Math.round(yTop);
                const xOutsideMedia = Math.round(xOutside);
                const yMidMedia = Math.round(yMid);
                // Draw background
                ctx.save();
                ctx.fillStyle = this._commonData.background;
                ctx.beginPath();
                ctx.moveTo(xInsideMedia, yTopMedia);
                ctx.lineTo(xOutsideMedia, yTopMedia);
                ctx.lineTo(xOutsideMedia, yBottom);
                ctx.lineTo(xInsideMedia, yBottom);
                ctx.fill();
                ctx.restore();
                // Draw border
                ctx.fillStyle = this._data.borderColor;
                ctx.fillRect(alignRight ? xInsideMedia - horzBorderMedia : 0, yTopMedia, horzBorderMedia, yBottom - yTopMedia);
                if (this._data.tickVisible) {
                    ctx.fillStyle = this._commonData.color;
                    ctx.fillRect(xInsideMedia, yMidMedia, xTick - xInsideMedia, tickHeight);
                }
                ctx.textAlign = 'left';
                ctx.fillStyle = this._commonData.color;
                // fillText operates directly on current ctx settings in media coordinates
                ctx.fillText(text, xText, yBottom - paddingBottom - baselineOffset);
            }
        });
    }
    /**
     * Calculates the total pixel height required to draw the label.
     *
     * This height includes font size and vertical padding defined in the options.
     *
     * @param rendererOptions - The {@link PriceAxisViewRendererOptions} for dimensions.
     * @param useSecondLine - Flag to calculate height for a second line of text (not typically used for price labels).
     * @returns The calculated height in pixels, or 0 if the label is invisible.
     */
    height(rendererOptions, useSecondLine) {
        if (!this._data.visible) {
            return 0;
        }
        return rendererOptions.fontSize + rendererOptions.paddingTop + rendererOptions.paddingBottom;
    }
}

// /src/views/price-axis-view.ts
/**
 * Abstract base class for Price Axis Views.
 *
 * This class implements the `ISeriesPrimitiveAxisView` interface and manages the data state
 * for two distinct renderers: one for the axis label itself and one for potential pane-side labels.
 * It handles caching, dirty state (`invalidated`), and integration with the stacking manager via `fixedCoordinate`.
 */
class PriceAxisView {
    /**
     * Initializes the Price Axis View.
     *
     * @param ctor - Optional constructor for the renderer. Defaults to `PriceAxisViewRenderer`.
     */
    constructor(ctor) {
        // These objects hold the data that will be passed to the actual renderer.
        // We have one for the "axis label" itself and one for potential "pane-side labels".
        this._commonRendererData = {
            coordinate: 0, // Price coordinates on the axis
            color: '#FFF', // Text color (default white)
            background: '#000', // Background color of the label (default black)
        };
        this._axisRendererData = {
            text: '',
            visible: false,
            tickVisible: true, // Option to draw a small tick mark next to the label
            moveTextToInvisibleTick: false, // If tick is invisible, should text move away?
            borderColor: '', // Border color for the label box
        };
        this._paneRendererData = {
            text: '',
            visible: false,
            tickVisible: false,
            moveTextToInvisibleTick: true,
            borderColor: '',
        };
        this._invalidated = true; // Flag to force and update
        // Use the provided constructor or default to PriceAxisViewRenderer
        const RendererImpl = ctor || PriceAxisViewRenderer; // PriceAxisViewRenderer will be defined in another file
        this._axisRenderer = new RendererImpl(this._axisRendererData, this._commonRendererData);
        this._paneRenderer = new RendererImpl(this._paneRendererData, this._commonRendererData);
    }
    // -------------------------------------------------------------------
    // Implementation of IPriceAxisView / ISeriesPrimitiveAxisView methods
    // -------------------------------------------------------------------
    /**
     * Retrieves the text to be displayed on the axis label.
     *
     * @returns The formatted price string.
     */
    text() {
        this._updateRendererDataIfNeeded();
        return this._axisRendererData.text; // Text visible on the axis
    }
    /**
     * Retrieves the Y-coordinate for the label.
     *
     * **Stacking Logic:** This method checks if a `fixedCoordinate` has been set by the
     * `PriceAxisLabelStackingManager`. If so, it returns that shifted coordinate to prevent
     * overlap. Otherwise, it returns the natural price-to-coordinate value.
     *
     * @returns The Y-coordinate in pixels.
     */
    coordinate() {
        this._updateRendererDataIfNeeded();
        // CRITICAL FIX: Return fixedCoordinate (the shifted value) if the Stacking Manager has set one.
        if (this._commonRendererData.fixedCoordinate !== undefined) {
            // Explicitly cast to Coordinate (the nominal type)
            return this._commonRendererData.fixedCoordinate;
        }
        // Otherwise, return the original, unshifted coordinate.
        return this._commonRendererData.coordinate;
    }
    /**
     * Marks the view as invalid, forcing a data recalculation on the next access.
     */
    update() {
        this._invalidated = true;
    }
    /**
     * Measures the height required by the label.
     *
     * It queries both the axis renderer and the pane renderer and returns the maximum height
     * to ensure sufficient space is reserved.
     *
     * @param rendererOptions - Current styling options from the chart.
     * @param useSecondLine - Whether to account for a second line of text (default `false`).
     * @returns The height in pixels.
     */
    height(rendererOptions, useSecondLine = false) {
        // Here, we don't call updateRendererDataIfNeeded to avoid side-effects during measurement.
        // The underlying renderer should be able to measure based on its current internal data.
        return Math.max(this._axisRenderer.height(rendererOptions, useSecondLine), this._paneRenderer.height(rendererOptions, useSecondLine));
    }
    /**
     * Retrieves the manually fixed Y-coordinate set by the Stacking Manager.
     *
     * @returns The fixed coordinate, or `0` if unset (nominal type cast).
     */
    getFixedCoordinate() {
        return (this._commonRendererData.fixedCoordinate || 0); // Nominal type cast
    }
    /**
     * Sets a manual Y-coordinate for this view.
     *
     * This is called by the `PriceAxisLabelStackingManager` when it detects a collision
     * with another label.
     *
     * @param value - The new Y-coordinate in pixels.
     */
    setFixedCoordinate(value) {
        this._commonRendererData.fixedCoordinate = value;
    }
    /**
     * Retrieves the text color for the label.
     *
     * @returns A CSS color string.
     */
    textColor() {
        this._updateRendererDataIfNeeded();
        return this._commonRendererData.color; // Text color
    }
    /**
     * Retrieves the background color for the label.
     *
     * @returns A CSS color string.
     */
    backColor() {
        this._updateRendererDataIfNeeded();
        return this._commonRendererData.background; // Label background color
    }
    /**
     * Checks if the view is currently visible.
     *
     * Returns `true` if either the main axis label or the pane-side label is set to visible.
     *
     * @returns `true` if visible, `false` otherwise.
     */
    visible() {
        this._updateRendererDataIfNeeded();
        return this._axisRendererData.visible || this._paneRendererData.visible;
    }
    /**
     * Retrieves the renderer for the main axis label.
     *
     * This method triggers a data update if the view is invalidated, applies the latest
     * data to the renderer instance, and returns it for drawing by the chart engine.
     *
     * @returns The {@link IPriceAxisViewRenderer} for the axis.
     */
    getRenderer() {
        this._updateRendererDataIfNeeded();
        // Apply price scale drawing options before sending renderer data
        // (No priceScale reference here, specific implementations will handle this logic)
        // For now, we'll just update with existing defaults/data from _updateRendererData.
        this._axisRenderer.setData(this._axisRendererData, this._commonRendererData);
        return this._axisRenderer;
    }
    /**
     * Retrieves the renderer for the pane-side label (e.g., text drawn inside the chart area near the axis).
     *
     * @returns The {@link IPriceAxisViewRenderer} for the pane.
     */
    getPaneRenderer() {
        this._updateRendererDataIfNeeded();
        this._paneRenderer.setData(this._paneRendererData, this._commonRendererData);
        return this._paneRenderer;
    }
    // -------------------------------------------------------------------
    // Private helper to ensure data is fresh before rendering
    // -------------------------------------------------------------------
    /**
     * Internal helper to trigger data recalculation if the view is dirty.
     *
     * It resets default visibility flags and colors before calling the abstract `_updateRendererData`.
     *
     * **Note on Stacking:** This method intentionally does *not* reset `fixedCoordinate`.
     * The fixed coordinate is managed exclusively by the concrete view's interaction with the
     * `PriceAxisLabelStackingManager`, ensuring that stacking shifts persist across standard update cycles.
     *
     * @private
     */
    _updateRendererDataIfNeeded() {
        if (this._invalidated) {
            // ** NOTE: fixedCoordinate is intentionally NOT reset here.
            // It is managed solely by the concrete view's _updateRendererData (which gets its value from the Stacking Manager)
            // to preserve the shifted Y position across update cycles.
            // Reset defaults before filling
            this._axisRendererData.text = '';
            this._axisRendererData.visible = false;
            this._axisRendererData.tickVisible = true;
            this._axisRendererData.moveTextToInvisibleTick = false;
            this._axisRendererData.borderColor = '';
            this._paneRendererData.text = '';
            this._paneRendererData.visible = false;
            this._paneRendererData.tickVisible = false;
            this._paneRendererData.moveTextToInvisibleTick = true;
            this._paneRendererData.borderColor = '';
            // Only reset coordinate, background, and color, which are always freshly recalculated
            this._commonRendererData.coordinate = 0;
            this._commonRendererData.color = '#FFF';
            this._commonRendererData.background = '#000';
            this._updateRendererData(this._axisRendererData, this._paneRendererData, this._commonRendererData);
            this._invalidated = false;
        }
    }
}

// /src/views/line-tool-price-axis-label-view.ts
/**
 * A concrete implementation of a Price Axis View for a specific anchor point of a Line Tool.
 *
 * This class manages the lifecycle of a single price label on the Y-axis. It is responsible for:
 * 1. formatting the price value based on the series configuration.
 * 2. determining visibility based on the tool's interaction state (selected, hovered).
 * 3. interacting with the {@link PriceAxisLabelStackingManager} to prevent label overlaps.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class LineToolPriceAxisLabelView extends PriceAxisView {
    /**
     * Initializes the price axis label view.
     *
     * @param tool - The parent line tool instance.
     * @param pointIndex - The index of the point in the tool's data array that this label represents.
     * @param chart - The chart API instance.
     * @param priceAxisLabelStackingManager - The manager instance to register this label with for collision resolution.
     */
    constructor(tool, pointIndex, chart, priceAxisLabelStackingManager) {
        super();
        // NEW: Store the fixed coordinate provided by the stacking manager
        this._fixedCoordinate = undefined;
        this._isRegistered = false;
        this._tool = tool;
        this._pointIndex = pointIndex;
        this._chart = chart;
        this._priceAxisLabelStackingManager = priceAxisLabelStackingManager;
    }
    /**
     * Retrieves the index of the point this label is associated with.
     *
     * Used primarily by the {@link PriceAxisLabelStackingManager} to generate a unique ID
     * for this label (e.g., `ToolID-pIndex`).
     *
     * @returns The zero-based point index.
     */
    getPointIndex() {
        return this._pointIndex;
    }
    /**
     * Callback method used by the {@link PriceAxisLabelStackingManager} to update the label's vertical position.
     *
     * If the stacking manager detects a collision, it calls this method with a new, adjusted Y-coordinate.
     * This method then triggers an immediate chart update to ensure the label is drawn at the new position
     * in the same render frame, preventing visual jitter.
     *
     * @param coordinate - The calculated collision-free Y-coordinate, or `undefined` to use the natural position.
     */
    setFixedCoordinateFromManager(coordinate) {
        if (this._fixedCoordinate !== coordinate) {
            this._fixedCoordinate = coordinate;
            this.update(); // Mark view as dirty
            // *** AGGRESSIVE FIX: Force a chart update to read the new fixed coordinate ***
            // This should eliminate the visual flicker during drag/scale by forcing the coordinate
            // to be read by the renderer within the same frame it was calculated.
            this._tool._triggerChartUpdate();
        }
    }
    /**
     * The core logic for updating the renderer's state.
     *
     * This overrides the abstract method from {@link PriceAxisView}. It performs several critical tasks:
     * 1. **Validity Check:** Verifies if the tool and point are valid; if not, unregisters the label from the stacking manager.
     * 2. **Registration:** Registers (or updates) the label with the {@link PriceAxisLabelStackingManager}, providing current height and position data.
     * 3. **Formatting:** Formats the price value into a string using the series' formatter.
     * 4. **Styling:** Applies high-contrast colors (using {@link generateContrastColors}) based on the tool's configuration.
     * 5. **Coordinate Sync:** Ensures the renderer uses the `fixedCoordinate` (if set) or the natural price coordinate.
     *
     * @param axisRendererData - The data object for the main axis label.
     * @param paneRendererData - The data object for any pane-side rendering (unused here).
     * @param commonData - Shared data (coordinates, colors) between axis and pane renderers.
     */
    _updateRendererData(axisRendererData, paneRendererData, commonData) {
        // Set fixed coordinate (from manager) at the very start
        commonData.fixedCoordinate = this._fixedCoordinate;
        axisRendererData.visible = false;
        paneRendererData.visible = false;
        const toolOptions = this._tool.options();
        const priceScaleApi = this._tool.priceScale();
        const series = this._tool.getSeries();
        const point = this._tool.getPoint(this._pointIndex);
        const labelId = this._tool.id() + '-p' + this._pointIndex;
        // 1. Calculate the tool's current interaction state
        const isToolActive = this._tool.isSelected() || this._tool.isHovered() || this._tool.isEditing() || this._tool.isCreating();
        // 2. Determine if the label should be visually active based on options
        const isLabelVisuallyActive = toolOptions.priceAxisLabelAlwaysVisible || isToolActive;
        // Determine if the label is structurally valid (Prerequisite for stacking registration)
        const isStructurallyValid = toolOptions.visible &&
            toolOptions.showPriceAxisLabels &&
            isLabelVisuallyActive &&
            point &&
            isFinite(point.price) &&
            priceScaleApi &&
            series;
        // --- 1. HANDLE UNREGISTER/CLEAR (If Structure Fails) ---
        if (!isStructurallyValid) {
            if (this._isRegistered) {
                this._priceAxisLabelStackingManager.unregisterLabel(labelId);
                this._isRegistered = false;
                this.setFixedCoordinateFromManager(undefined); // Clear old fixed coordinate
            }
            return;
        }
        // --- 2. CALCULATE DATA & HEIGHT (Runs only if structurally valid) ---
        const backgroundColor = this._tool.priceAxisLabelColor();
        // The manager needs the coordinate regardless of the color being null, but LWC views should be clean.
        commonData.coordinate = series.priceToCoordinate(point.price);
        // Height calculation remains complex, relying on temporary setup:
        const layoutOptions = this._chart.options().layout;
        const priceScaleOptions = priceScaleApi.options();
        const currentRendererOptions = {
            font: `${layoutOptions.fontSize}px ${layoutOptions.fontFamily}`,
            fontFamily: layoutOptions.fontFamily,
            color: layoutOptions.textColor,
            fontSize: layoutOptions.fontSize,
            // Approximate/Default internal padding and sizing from V3.8's PriceAxisRendererOptionsProvider defaults
            baselineOffset: Math.round(layoutOptions.fontSize / 10),
            borderSize: priceScaleOptions.borderVisible ? 1 : 0,
            paddingBottom: Math.floor(layoutOptions.fontSize / 3.5),
            paddingTop: Math.floor(layoutOptions.fontSize / 3.5),
            paddingInner: Math.max(Math.ceil(layoutOptions.fontSize / 2 - (priceScaleOptions.ticksVisible ? 4 : 0) / 2), 0),
            paddingOuter: Math.ceil(layoutOptions.fontSize / 2 + (priceScaleOptions.ticksVisible ? 4 : 0) / 2),
            tickLength: priceScaleOptions.ticksVisible ? 4 : 0,
        };
        let labelHeight = 16;
        try {
            const textToMeasure = series.priceFormatter().format(point.price) || '0';
            const tempRendererData = { text: textToMeasure, visible: true, tickVisible: false };
            const tempCommonData = { coordinate: 0, background: 'black', color: 'white' };
            const tempRenderer = new PriceAxisViewRenderer(tempRendererData, tempCommonData);
            labelHeight = tempRenderer.height(currentRendererOptions, false);
        }
        catch (e) {
            // fallback
        }
        // --- 3. REGISTER/UPDATE with Stacking Manager (Upsert) ---
        this._priceAxisLabelStackingManager.registerLabel({
            id: labelId,
            toolId: this._tool.id(),
            originalCoordinate: commonData.coordinate,
            height: labelHeight,
            setFixedCoordinate: (coord) => this.setFixedCoordinateFromManager(coord),
            isVisible: () => true, // We are structurally valid, so we are visible to the manager
        });
        this._isRegistered = true;
        // --- 4. FINAL RENDERER DATA SETUP (Drawing Properties) ---
        // Only set drawing properties if the label is interactionally visible (color is supplied)
        if (backgroundColor !== null) {
            const colors = generateContrastColors(backgroundColor);
            commonData.background = colors.background;
            commonData.color = colors.foreground;
            axisRendererData.text = series.priceFormatter().format(point.price);
            axisRendererData.borderColor = colors.background;
            axisRendererData.visible = true; // Make label draw
        }
        else {
            // If visually inactive, ensure data sent to renderer is clean
            axisRendererData.visible = false;
        }
        // The fixed coordinate is already set by the manager's logic. We trust the coordinate() getter to return it.
    }
}

// /src/utils/text-width-cache.ts
/**
 * Default Regular Expression used to optimize text measurement.
 *
 * It replaces digits 2 through 9 with '0'. This assumes that all digits have the
 * same width in tabular numbers (which is standard for many UI fonts).
 * This increases cache hit rates by treating strings like "123.45" and "123.46" as identical ("100.00")
 * for measurement purposes.
 */
const defaultReplacementRe = /[2-9]/g;
/**
 * A Least Recently Used (LRU) cache for text width measurements.
 *
 * Measuring text on an HTML5 Canvas is an expensive operation. This class caches the
 * results of `measureText` calls to significantly improve rendering performance, especially
 * for axis labels and crosshair values that change frequently but repeat values.
 */
class TextWidthCache {
    /**
     * Initializes the cache with a specific capacity.
     *
     * @param size - The maximum number of text metrics to store before evicting the oldest entries. Default is 50.
     */
    constructor(size = 50) {
        this._actualSize = 0;
        this._usageTick = 1;
        this._oldestTick = 1;
        this._tick2Labels = {}; // Maps usage tick to cacheString
        this._cache = new Map(); // Maps cacheString to metrics and usage tick
        this._maxSize = size;
    }
    /**
     * Clears all cached entries and resets the usage tracking.
     *
     * This should be called when font settings change (e.g., font size or family updates),
     * as previous measurements would be invalid.
     */
    reset() {
        this._actualSize = 0;
        this._cache.clear();
        this._usageTick = 1;
        this._oldestTick = 1;
        this._tick2Labels = {};
    }
    /**
     * Measures the width of the provided text, using the cache if available.
     *
     * If the text (after optimization replacement) is in the cache, the stored width is returned.
     * Otherwise, the text is measured using the provided context, stored in the cache, and returned.
     *
     * @param ctx - The canvas context to use for measurement if the cache misses.
     * @param text - The text string to measure.
     * @param optimizationReplacementRe - Optional regex to normalize the text (e.g., replacing digits with '0') to increase cache hits.
     * @returns The width of the text in pixels.
     */
    measureText(ctx, text, optimizationReplacementRe) {
        return this._getMetrics(ctx, text, optimizationReplacementRe).width;
    }
    /**
     * Calculates the vertical offset required to center text accurately.
     *
     * Canvas `textBaseline = 'middle'` often results in slight visual misalignment depending on the font.
     * This method uses `actualBoundingBoxAscent` and `actualBoundingBoxDescent` (if supported)
     * to calculate a pixel-perfect vertical correction.
     *
     * @param ctx - The canvas context.
     * @param text - The text string to measure.
     * @param optimizationReplacementRe - Optional optimization regex.
     * @returns The y-axis offset in pixels.
     */
    yMidCorrection(ctx, text, optimizationReplacementRe) {
        const metrics = this._getMetrics(ctx, text, optimizationReplacementRe);
        // if actualBoundingBoxAscent/actualBoundingBoxDescent are not supported we use 0 as a fallback
        return ((metrics.actualBoundingBoxAscent || 0) - (metrics.actualBoundingBoxDescent || 0)) / 2;
    }
    /**
     * Internal method to retrieve or compute `TextMetrics` for a string.
     *
     * Handles the core LRU logic:
     * 1. Applies the optimization regex to the input text key.
     * 2. Checks the cache. If found, updates the usage tick and returns.
     * 3. If missing, evicts the oldest entry if the cache is full.
     * 4. Measures the text and stores the result.
     *
     * @param ctx - The canvas context.
     * @param text - The text to measure.
     * @param optimizationReplacementRe - Regex for digit normalization.
     * @returns The standard `TextMetrics` object.
     * @private
     */
    _getMetrics(ctx, text, optimizationReplacementRe) {
        const re = optimizationReplacementRe || defaultReplacementRe;
        const cacheString = String(text).replace(re, '0');
        // Check if the string is already in the cache
        if (this._cache.has(cacheString)) {
            // Update usage tick to mark it as recently used
            const cacheEntry = ensureDefined(this._cache.get(cacheString));
            cacheEntry.tick = this._usageTick++;
            return cacheEntry.metrics;
        }
        // If cache is full, remove the oldest item
        if (this._actualSize === this._maxSize) {
            const oldestValueString = this._tick2Labels[this._oldestTick];
            delete this._tick2Labels[this._oldestTick];
            this._cache.delete(oldestValueString);
            this._oldestTick++;
            this._actualSize--;
        }
        // Measure text and add to cache
        ctx.save();
        ctx.textBaseline = 'middle'; // Ensure consistent baseline for measurement
        const metrics = ctx.measureText(cacheString);
        ctx.restore();
        if (metrics.width === 0 && !!text.length) {
            // measureText can return 0 in FF depending on a canvas size, don't cache it
            return metrics;
        }
        this._cache.set(cacheString, { metrics: metrics, tick: this._usageTick });
        this._tick2Labels[this._usageTick] = cacheString;
        this._actualSize++;
        this._usageTick++;
        return metrics;
    }
}

// /src/rendering/time-axis-view-renderer.ts
// Regular expression to replace digits for optimized text width measurement, from v3.8
const optimizationReplacementRe = /[1-9]/g;
/**
 * The concrete implementation of a renderer responsible for drawing labels on the Time Axis.
 *
 * This class calculates the layout, performs necessary position adjustments (to prevent labels
 * from drawing outside the time scale boundary), and draws the background, tick mark, and text.
 */
class TimeAxisViewRenderer {
    /**
     * Initializes the renderer. Data is set later via `setData`.
     */
    constructor() {
        this._data = null;
        this._fallbackTextWidthCache = null; // NEW: Fallback cache
        // Data will be set via setData later
    }
    /**
     * Updates the data payload required to draw the time axis label.
     *
     * @param data - The {@link TimeAxisViewRendererData} containing the text, coordinate, and style.
     * @returns void
     */
    setData(data) {
        this._data = data;
    }
    /**
     * Draws the time axis label onto the chart's time scale area.
     *
     * This method calculates the label's required width, adjusts its final X-coordinate to ensure
     * it stays within the visible time scale bounds, and then draws the background, tick mark, and text.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @param rendererOptions - The {@link TimeAxisViewRendererOptions} for styling and dimensions.
     * @returns void
     */
    draw(target, // LWC v5 Primitive API signature
    rendererOptions) {
        if (this._data === null || this._data.visible === false || this._data.text.length === 0) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            ctx.font = rendererOptions.font;
            // NEW: Ensure a TextWidthCache is available
            const textWidthCacheToUse = rendererOptions.widthCache || this._ensureFallbackTextWidthCache();
            // Measure text width using our TextWidthCache in rendererOptions
            // MODIFIED: Use the determined textWidthCacheToUse
            const textWidth = Math.round(textWidthCacheToUse.measureText(ctx, this._data.text, optimizationReplacementRe));
            if (textWidth <= 0) {
                return;
            }
            const horzMargin = rendererOptions.paddingHorizontal;
            const labelWidth = textWidth + 2 * horzMargin;
            const labelWidthHalf = labelWidth / 2;
            const timeScaleWidth = this._data.width; // Chart body width
            let coordinate = this._data.coordinate; // X-coordinate of the mark itself
            let x1 = Math.floor(coordinate - labelWidthHalf) + 0.5; // Start X of the label box
            // Adjust x1 to keep label within time scale bounds (v3.8 logic)
            if (x1 < 0) {
                coordinate = coordinate + Math.abs(0 - x1);
                x1 = Math.floor(coordinate - labelWidthHalf) + 0.5;
            }
            else if (x1 + labelWidth > timeScaleWidth) {
                coordinate = coordinate - Math.abs(timeScaleWidth - (x1 + labelWidth));
                x1 = Math.floor(coordinate - labelWidthHalf) + 0.5;
            }
            const x2 = x1 + labelWidth; // End X of the label box
            const y1 = 0; // Top of the time axis area
            const y2 = (y1 +
                rendererOptions.borderSize +
                rendererOptions.paddingTop +
                rendererOptions.fontSize +
                rendererOptions.paddingBottom); // Bottom of the label box
            // Draw background for the label box
            ctx.fillStyle = this._data.background;
            ctx.fillRect(Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1));
            // Draw the tick mark line (small vertical line under the label)
            const tickX = Math.round(this._data.coordinate); // Center of the mark
            const tickTop = Math.round(y1);
            const tickBottom = Math.round(y2 + rendererOptions.tickLength); // Extends below the label box
            ctx.fillStyle = this._data.color; // Text color also usually for tick
            const tickWidth = 1; // 1 CSS pixel thick tick line
            const tickOffset = 0.5; // For pixel snapping, center the 1px line
            ctx.fillRect(tickX - tickOffset, tickTop, tickWidth, tickBottom - tickTop);
            // Draw the text
            const yText = y2 - rendererOptions.baselineOffset - rendererOptions.paddingBottom;
            ctx.textAlign = 'left';
            ctx.fillStyle = this._data.color;
            // fillText operates directly in media coordinates
            ctx.fillText(this._data.text, x1 + horzMargin, yText);
        });
    }
    /**
     * Calculates the total pixel height required to draw the label.
     *
     * This height includes font size, vertical padding, and border size.
     *
     * @param rendererOptions - The {@link TimeAxisViewRendererOptions} for dimensions.
     * @returns The calculated height in pixels.
     */
    height(rendererOptions) {
        // Calculate the height based on options, similar to how y2 is calculated in draw
        return rendererOptions.borderSize + rendererOptions.paddingTop + rendererOptions.fontSize + rendererOptions.paddingBottom;
    }
    /**
     * Ensures a fallback {@link TextWidthCache} instance exists if one is not provided in `rendererOptions`.
     *
     * @returns The active {@link ITextWidthCache} instance.
     * @private
     */
    _ensureFallbackTextWidthCache() {
        if (this._fallbackTextWidthCache === null) {
            this._fallbackTextWidthCache = new TextWidthCache();
        }
        return this._fallbackTextWidthCache;
    }
}

// /src/views/line-tool-time-axis-label-view.ts
/**
 * A concrete implementation of a Time Axis View for a specific anchor point of a Line Tool.
 *
 * This class manages the lifecycle of a single label on the X-axis (Time Scale).
 * Unlike standard views, it implements specialized logic to render labels in the "blank space"
 * (future dates) by using logical index interpolation, ensuring tools can be drawn
 * beyond the last existing data bar.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item (e.g., `Time` or `UTCTimestamp`).
 */
class LineToolTimeAxisLabelView {
    /**
     * Initializes the time axis label view.
     *
     * @param tool - The parent line tool instance.
     * @param pointIndex - The index of the point in the tool's data array that this label represents.
     * @param chart - The chart API instance (used for time scale access and formatting).
     */
    constructor(tool, pointIndex, chart) {
        this._rendererData = {
            visible: false,
            background: '#4c525e', // Default background, will be overridden
            color: 'white', // Default text color, will be overridden
            text: '',
            width: 0, // Will be filled by updateImpl
            coordinate: 0, // X-coordinate will be filled by updateImpl
        };
        this._invalidated = true;
        this._tool = tool;
        this._pointIndex = pointIndex;
        this._chart = chart;
        this._timeScale = chart.timeScale(); // Initialize timeScale reference
        this._renderer = new TimeAxisViewRenderer(); // Instantiate the renderer
        // No need to setData in constructor; _updateRendererDataIfNeeded will call it later.
    }
    // -------------------------------------------------------------------
    // Implementation of ITimeAxisView / ISeriesPrimitiveAxisView methods
    // -------------------------------------------------------------------
    /**
     * Marks the view as invalidated.
     *
     * This signals that the internal data (text, coordinate, color) needs to be recalculated
     * before the next render cycle. This is typically called when the tool moves or options change.
     */
    update() {
        this._invalidated = true;
    }
    /**
     * Retrieves the renderer responsible for drawing the label.
     *
     * This method ensures the renderer's data is up-to-date by triggering a recalculation
     * (`_updateImpl`) if the view is invalidated.
     *
     * @returns The {@link ITimeAxisViewRenderer} instance.
     */
    getRenderer() {
        // Ensure renderer data is up-to-date before returning the renderer
        this._updateRendererDataIfNeeded();
        this._renderer.setData(this._rendererData); // setData is now a required method.
        return this._renderer;
    }
    /**
     * Retrieves the formatted text content for the label.
     *
     * @returns The formatted date/time string based on the chart's localization settings.
     */
    text() {
        this._updateRendererDataIfNeeded();
        return this._rendererData.text;
    }
    /**
     * Retrieves the X-coordinate of the label's center.
     *
     * @returns The screen coordinate in pixels.
     */
    coordinate() {
        this._updateRendererDataIfNeeded();
        return this._rendererData.coordinate;
    }
    /**
     * Retrieves the text color.
     *
     * @returns A CSS color string (usually calculated for high contrast against the background).
     */
    textColor() {
        this._updateRendererDataIfNeeded();
        return this._rendererData.color;
    }
    /**
     * Retrieves the background color of the label tag.
     *
     * @returns A CSS color string (derived from the tool's styling options).
     */
    backColor() {
        this._updateRendererDataIfNeeded();
        return this._rendererData.background;
    }
    /**
     * Checks if the label should be currently visible.
     *
     * Visibility depends on:
     * 1. The tool's global visibility.
     * 2. The `showTimeAxisLabels` option.
     * 3. The tool's interaction state (selected/hovered) vs. `timeAxisLabelAlwaysVisible`.
     *
     * @returns `true` if the label should be drawn.
     */
    visible() {
        this._updateRendererDataIfNeeded();
        return this._rendererData.visible;
    }
    /**
     * Calculates the required height of the label in the time scale area.
     *
     * This delegates to the renderer's measurement logic to ensure consistency.
     *
     * @param rendererOptions - Current styling options for the time axis.
     * @returns The height in pixels.
     */
    height(rendererOptions) {
        // Delegate to the actual renderer to calculate its perceived height
        // This ensures consistency between measure and draw.
        return this._renderer.height(rendererOptions);
    }
    // -------------------------------------------------------------------
    // Private/Protected helper methods for updating data
    // -------------------------------------------------------------------
    /**
     * Internal helper to trigger data recalculation only if the view is dirty.
     *
     * @private
     */
    _updateRendererDataIfNeeded() {
        if (this._invalidated) {
            this._updateImpl();
            this._invalidated = false;
        }
    }
    /**
     * The core logic for calculating the label's data.
     *
     * Performs the following critical steps:
     * 1. **Visibility Check:** Determines if the label should be shown based on options and state.
     * 2. **Styling:** Calculates background and high-contrast text colors.
     * 3. **Formatting:** Uses `horzScaleBehavior` to format the timestamp into a string.
     * 4. **Coordinate Calculation (The "Blank Space" Logic):**
     *    Instead of standard `timeToCoordinate` (which fails for future dates), it uses
     *    {@link interpolateLogicalIndexFromTime} to calculate a logical position even
     *    where no data exists, allowing the label to be placed accurately in the empty future space.
     *
     * @private
     */
    _updateImpl() {
        const data = this._rendererData;
        data.visible = false; // Start as invisible
        const toolOptions = this._tool.options();
        // Determine label visibility based on options and active state
        const isToolActive = this._tool.isSelected() || this._tool.isHovered() || this._tool.isEditing() || this._tool.isCreating();
        // The label is visible if:
        // 1. Tool is generally visible AND
        // 2. showTimeAxisLabels is true AND
        // 3. (Label is set to "Always Visible" OR Tool is currently in an active state)
        if (!toolOptions.visible || !toolOptions.showTimeAxisLabels || !(toolOptions.timeAxisLabelAlwaysVisible || isToolActive)) {
            return;
        }
        // Get the specific point for this label
        const point = this._tool.getPoint(this._pointIndex);
        if (!point || !isFinite(point.timestamp)) {
            return;
        }
        // Determine the background color for the label
        const backgroundColor = this._tool.timeAxisLabelColor();
        if (backgroundColor === null) {
            return;
        }
        // Use the utility to generate contrasting text color
        const colors = generateContrastColors(backgroundColor);
        data.background = colors.background;
        data.color = colors.foreground;
        if (this._timeScale.getVisibleLogicalRange() === null) {
            return;
        }
        // Use HorzScaleBehavior to get the correct internal object for formatting
        // Assert the raw timestamp (which is a number) directly to the generic placeholder type (HorzScaleItem).
        const timeAsHorzScaleItem = point.timestamp;
        // Convert raw time to the internal LWC object structure needed for full format/coordinate functions.
        // This ensures we get the *exact* object expected by LWC's internal APIs.
        const internalHorzItemForFormatting = this._tool.horzScaleBehavior.convertHorzItemToInternal(timeAsHorzScaleItem);
        // Apply Formatting
        data.text = this._tool.horzScaleBehavior.formatHorzItem(internalHorzItemForFormatting);
        // --- 2. COORDINATE FIX: Get Interpolated Logical Index for Blank Space Plotting ---
        /*
         * We must use the structural method to get a Logical Index that accounts for blank space.
         *
         * We already have 'timeAsHorzScaleItem' (which is just the timestamp number).
         * LWC's logicalToCoordinate requires a 'Logical' number which is correct if the index exists.
         *
         * We rely on the utility function [interpolateLogicalIndexFromTime] (the only way to safely
         * get an interpolated logical position in blank space for now).
        */
        // Convert the time to a Logical Index that solves the blank space problem.
        // We use the raw timestamp (which is part of the 'Time' union type expected by the geometry helper).
        const interpolatedLogicalIndex = interpolateLogicalIndexFromTime(this._chart, this._tool.getSeries(), // Pass ISeriesApi from the BaseLineTool
        timeAsHorzScaleItem);
        if (interpolatedLogicalIndex === null) {
            console.warn(`[TimeLabelView] Skipping update: Time-to-Index Interpolation failed for timestamp ${point.timestamp}`);
            return;
        }
        // Convert the interpolated Logical Index into a Screen Coordinate.
        const coordinate = this._timeScale.logicalToCoordinate(interpolatedLogicalIndex);
        if (coordinate === null || !isFinite(coordinate)) {
            console.warn(`[TimeLabelView] Skipping update: Logical-to-Coordinate failed for index ${interpolatedLogicalIndex}`);
            return;
        }
        // Finalize data
        data.coordinate = coordinate;
        data.width = this._timeScale.width();
        data.visible = true;
    }
}

// /src/model/base-line-tool.ts
/**
 * The abstract base class for all line drawing tools in the plugin.
 *
 * This class extends {@link PriceDataSource} and implements the Lightweight Charts `ISeriesPrimitive`
 * interface. It provides a common set of properties, utility methods for coordinate conversion,
 * state management (selection, hover, editing), and hooks for custom behavior (hit-testing, constraints).
 * All custom line tool implementations must extend this class.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item (e.g., `Time` or `number`).
 */
class BaseLineTool extends PriceDataSource {
    /**
     * Provides an array of price axis view components to Lightweight Charts for rendering the tool's labels.
     *
     * This implementation wraps the internal `_priceAxisLabelViews` array.
     *
     * @returns A readonly array of {@link IPriceAxisView} components.
     */
    priceAxisViews() {
        // Defensive check: Do not return views if the tool is already marked for destruction
        if (this._isDestroying)
            return [];
        const views = [...this._priceAxisLabelViews];
        return views;
    }
    /**
     * Provides an array of time axis view components to Lightweight Charts for rendering the tool's labels.
     *
     * This implementation wraps the internal `_timeAxisLabelViews` array.
     *
     * @returns A readonly array of {@link ITimeAxisView} components.
     */
    timeAxisViews() {
        // Defensive check: Do not return views if the tool is already marked for destruction
        if (this._isDestroying)
            return [];
        const views = [...this._timeAxisLabelViews];
        return views;
    }
    /**
     * Temporarily overrides the cursor style displayed over the chart pane, bypassing normal hover detection.
     *
     * This is typically used by the {@link InteractionManager} during an active drag or edit gesture
     * to ensure the cursor stays consistent (e.g., `grabbing`) regardless of where the mouse moves.
     *
     * @param cursor - The {@link PaneCursorType} to enforce, or `null` to revert to default behavior.
     */
    setOverrideCursor(cursor) {
        this._overrideCursor = cursor;
    }
    /**
     * The public hit-test method required by the Lightweight Charts `ISeriesPrimitive` interface.
     *
     * This method acts as an adapter, calling `_internalHitTest` and converting its internal
     * result (`HitTestResult`) into the required LWC `PrimitiveHoveredItem` format, including
     * cursor determination and Z-order.
     *
     * @param x - The X coordinate from Lightweight Charts (in pixels).
     * @param y - The Y coordinate from Lightweight Charts (in pixels).
     * @returns A `PrimitiveHoveredItem` if the tool is hit, otherwise `null`.
     */
    hitTest(x, y) {
        //console.log(`[BaseLineTool] Public hitTest called at X:${x}, Y:${y}`);
        // Check for override first
        // If an override is set (e.g., during dragging), return it immediately
        // and bypass the renderer's geometric checks for cursor style.
        if (this._overrideCursor) {
            return {
                externalId: this.id(),
                zOrder: 'normal',
                cursorStyle: this._overrideCursor,
            };
        }
        if (!this.options().editable) {
            // Even if there's no actual "hit" data, we can still suggest a cursor
            // to the chart if the mouse is over the tool's general area.
            // To do this, we need to perform a minimal hit check first.
            const ourX = x;
            const ourY = y;
            const internalResult = this._internalHitTest(ourX, ourY);
            if (internalResult !== null) {
                //console.log(`[BaseLineTool] Tool is not editable. Forcing cursor to 'not-allowed'.`);
                return {
                    externalId: this.id(),
                    zOrder: 'normal',
                    cursorStyle: this.options().notEditableCursor || PaneCursorType.NotAllowed,
                };
            }
            return null; // No hit on non-editable tool
        }
        // Convert LWChart's number coordinates to our plugin's nominal Coordinate type
        const ourX = x;
        const ourY = y;
        const internalResult = this._internalHitTest(ourX, ourY);
        if (internalResult === null) {
            //console.log(`[BaseLineTool] Internal hitTest returned NULL.`);
            return null;
        }
        // Adapt our internal HitTestResult to ISeriesPrimitive's expected PrimitiveHoveredItem
        //console.log(`[BaseLineTool] Internal hitTest returned: Type=${internalResult.type()}, Data=${JSON.stringify(internalResult.data())}`); 
        const hitData = internalResult.data();
        let cursorStyle = PaneCursorType.Default;
        if (hitData?.suggestedCursor) {
            cursorStyle = hitData.suggestedCursor; // Use the specific cursor suggested by the hit
            //console.log(`[BaseLineTool] Using suggestedCursor from hitData: ${cursorStyle}`);
        }
        else {
            // Fallback to tool options or generic defaults if no specific suggestedCursor is provided by hitData
            const options = this.options();
            switch (internalResult.type()) {
                case HitTestType.MovePointBackground:
                    // Use tool's defaultDragCursor or a generic 'grabbing'
                    cursorStyle = options.defaultDragCursor || PaneCursorType.Grabbing;
                    //console.log(`[BaseLineTool] Using defaultDragCursor: ${cursorStyle}`);
                    break;
                case HitTestType.MovePoint:
                case HitTestType.Regular:
                    // Use tool's defaultHoverCursor or a generic 'pointer'
                    cursorStyle = options.defaultHoverCursor || PaneCursorType.Pointer;
                    //console.log(`[BaseLineTool] Using defaultHoverCursor: ${cursorStyle}`);
                    break;
                case HitTestType.ChangePoint:
                    // For anchor points, a generic resize cursor if not specifically set elsewhere
                    cursorStyle = PaneCursorType.DiagonalNwSeResize; // Example, can be refined.
                    //console.log(`[BaseLineTool] Using generic DiagonalNwSeResize for ChangePoint.`);
                    break;
                default:
                    cursorStyle = PaneCursorType.Default;
                    //console.log(`[BaseLineTool] Using PaneCursorType.Default as fallback.`);
                    break;
            }
        }
        // Return the PrimitiveHoveredItem.
        //console.log(`[BaseLineTool] Final cursor selected for PrimitiveHoveredItem: ${cursorStyle}`);
        return {
            externalId: this.id(), // Return the unique ID of the tool
            zOrder: 'normal', // Default zOrder for line tools
            cursorStyle: cursorStyle, // NEW: Use the determined cursorStyle
        };
    }
    /**
     * Initializes the Base Line Tool instance.
     *
     * Sets up core references, assigns the unique ID, and creates the persistent Price and Time Axis View instances
     * based on the tool's required `pointsCount`.
     *
     * @param coreApi - The core plugin instance.
     * @param chart - The chart API instance.
     * @param series - The series API instance this tool is attached to.
     * @param horzScaleBehavior - The horizontal scale behavior for time conversion utilities.
     * @param finalOptions - The complete and final configuration options for the tool instance.
     * @param points - Initial array of logical points.
     * @param toolType - The specific string identifier for the tool.
     * @param pointsCount - The fixed number of points this tool requires (`-1` for unbounded).
     * @param priceAxisLabelStackingManager - The manager for label collision resolution.
     */
    constructor(coreApi, chart, series, horzScaleBehavior, finalOptions, points = [], toolType, pointsCount, priceAxisLabelStackingManager) {
        super(chart);
        // Storage for axis view instances
        this._priceAxisLabelViews = [];
        this._timeAxisLabelViews = [];
        this._overrideCursor = null;
        this._options = {};
        this._paneViews = [];
        // Interaction state
        this._selected = false;
        this._hovered = false;
        this._editing = false;
        this._creating = false;
        this._lastPoint = null;
        this._editedPointIndex = null;
        this._currentPoint = new Point(0, 0);
        this._isDestroying = false;
        this._attachedPane = null;
        this._id = randomHash();
        this._coreApi = coreApi;
        this._chart = chart;
        this._series = series;
        this._horzScaleBehavior = horzScaleBehavior;
        this._points = points;
        this._creating = points.length === 0;
        this.toolType = toolType;
        this.pointsCount = pointsCount;
        this._priceAxisLabelStackingManager = priceAxisLabelStackingManager;
        // We assume the concrete tool has already handled the deep copy and merge,
        // and is passing the final, ready-to-use options object.
        this._setupOptions(finalOptions);
        // *** NEW LOGIC: Create persistent axis views here ***
        // If pointsCount is -1 (dynamic), we will handle view creation inside updateAllViews.
        if (this.pointsCount !== -1) {
            for (let i = 0; i < this.pointsCount; i++) {
                this._priceAxisLabelViews[i] = new LineToolPriceAxisLabelView(this, i, this._chart, this._priceAxisLabelStackingManager);
                this._timeAxisLabelViews[i] = new LineToolTimeAxisLabelView(this, i, this._chart);
            }
        }
    }
    /**
     * Lifecycle hook called by Lightweight Charts when the primitive is first attached to a series.
     *
     * This method finalizes the setup by acquiring necessary runtime references:
     * the `IPriceScaleApi`, the `requestUpdate` callback, and the {@link IPaneApi} reference.
     *
     * @param param - The parameters provided by Lightweight Charts upon attachment.
     * @returns void
     */
    attached(param) {
        this._chart = param.chart;
        this._series = param.series;
        this.setPriceScale(param.series.priceScale());
        this._requestUpdate = param.requestUpdate;
        this._horzScaleBehavior = param.horzScaleBehavior;
        // Dynamically find and store the IPaneApi object for the pane this tool's series is in.
        // We iterate through all panes of the chart and check if our series instance is part of that pane.
        this._attachedPane = this._chart.panes().find(p => {
            // Use direct instance comparison since ISeriesApi does not have a public .id() method
            return p.getSeries().some(s => s === this._series);
        }) || null;
        if (!this._attachedPane) {
            console.warn(`[BaseLineTool] Tool ${this.id()} attached to a series not found in any pane. This primitive relies on IPaneApi access.`);
        }
        console.log(`Tool ${this.toolType} with ID ${this.id()} attached to series.`);
    }
    /**
     * Lifecycle hook called by Lightweight Charts when the primitive is detached from a series.
     *
     * This performs crucial cleanup by nullifying references to external Lightweight Charts API objects
     * (chart, series, pane, etc.) to prevent memory leaks and stale closures.
     *
     * @returns void
     */
    detached() {
        console.log(`[BaseLineTool] Tool ${this.id()} detached from series.`);
        // Nullify references to LWCharts APIs to prevent memory leaks / stale closures.
        // This is important because chart/series APIs might hold references back to the primitive.
        // Cast to `any` only where strictly necessary for re-assigning readonly properties for cleanup.
        this._chart = null;
        this._series = null;
        this._horzScaleBehavior = null;
        this._attachedPane = null; // Clear the IPaneApi reference
        this._requestUpdate = null; // Clear the requestUpdate callback
    }
    /**
     * Returns the {@link IPaneApi} instance to which this tool is currently attached.
     *
     * This reference is required for internal operations like detaching the tool primitive.
     *
     * @returns The {@link IPaneApi} for the attached pane.
     * @throws An error if the tool has not been successfully attached to a series/pane yet.
     */
    getPane() {
        if (!this._attachedPane) {
            throw new Error(`Tool ${this.id()} is not attached to a pane. 'attached()' might not have been called or ran into an issue.`);
        }
        return this._attachedPane;
    }
    // #region Public API for managing tool state & properties
    /**
     * Retrieves the unique string identifier for this tool instance.
     *
     * @returns The unique ID.
     */
    id() { return this._id; }
    /**
     * Sets a specific unique ID for this tool instance.
     *
     * This is primarily used during programmatic creation via {@link LineToolsCorePlugin.createOrUpdateLineTool}
     * to ensure a user-defined ID is preserved.
     *
     * @param id - The unique string ID to assign.
     * @returns void
     */
    setId(id) { this._id = id; }
    /**
     * Checks if the tool is currently in the selected state.
     *
     * The selected state typically enables anchor handles and border highlighting.
     *
     * @returns `true` if selected, `false` otherwise.
     */
    isSelected() { return this._selected; }
    /**
     * Checks if the mouse cursor is currently hovering over the tool.
     *
     * The hovered state often triggers a temporary visual change, like a different border color.
     *
     * @returns `true` if hovered, `false` otherwise.
     */
    isHovered() { return this._hovered; }
    /**
     * Checks if the tool is currently being actively edited (i.e., an anchor point is being dragged).
     *
     * The editing state is distinct from being merely selected.
     *
     * @returns `true` if an anchor is being dragged, `false` otherwise.
     */
    isEditing() { return this._editing; }
    /**
     * Checks if the tool is currently in the process of being created by user interaction.
     *
     * The creating state is active from the moment the tool is initiated until its final point is placed.
     *
     * @returns `true` if in creation mode, `false` otherwise.
     */
    isCreating() { return this._creating; }
    /**
     * Sets the tool's selection state and triggers a view update to reflect the change.
     *
     * @param selected - The new selection state (`true` to select, `false` to deselect).
     * @returns void
     */
    setSelected(selected) {
        this._selected = selected;
        this.updateAllViews();
        this._requestUpdate?.();
    }
    /**
     * Sets the tool's hovered state and triggers a view update if the state changes.
     *
     * @param hovered - The new hover state.
     * @returns void
     */
    setHovered(hovered) {
        this._hovered = hovered;
        this.updateAllViews();
        this._requestUpdate?.();
    }
    /**
     * Sets the tool's editing state (active drag is in progress).
     *
     * This typically happens when the user clicks down on an anchor and moves beyond the drag threshold.
     *
     * @param editing - The new editing state.
     * @returns void
     */
    setEditing(editing) {
        this._editing = editing;
        this.updateAllViews();
        this._requestUpdate?.();
    }
    /**
     * Sets the tool's creation state.
     *
     * This is used internally by the {@link InteractionManager} to track which tool instance
     * is currently accepting new points from user clicks.
     *
     * @param creating - The new creation state.
     * @returns void
     */
    setCreating(creating) {
        this._creating = creating;
    }
    /**
     * Returns the index of the anchor point currently being dragged/edited.
     *
     * @returns The zero-based index of the dragged point, or `null` if `isEditing` is false.
     */
    editedPointIndex() {
        return this._editing ? this._editedPointIndex : null;
    }
    /**
     * Sets the index of the anchor point that is currently the target of an editing drag.
     *
     * @param index - The index of the point, or `null` to clear the reference.
     * @returns void
     */
    setEditedPointIndex(index) {
        this._editedPointIndex = index;
    }
    /**
     * Retrieves the last known screen coordinates of the mouse cursor over the chart.
     *
     * This point is continuously updated by the {@link InteractionManager} and is used by renderers
     * (like the anchor renderer) to draw effects relative to the mouse position (e.g., hover halo).
     *
     * @returns A {@link Point} object with the current mouse screen coordinates.
     */
    currentPoint() {
        return this._currentPoint;
    }
    /**
     * Sets the last known screen coordinates of the mouse cursor.
     *
     * @param point - The new screen coordinate point.
     * @returns void
     */
    setCurrentPoint(point) {
        this._currentPoint = point;
    }
    /**
     * Retrieves the full list of points used for drawing the tool.
     *
     * This list includes both the permanent, committed points (`_points`) and, if the tool is in
     * creation mode, the single temporary "ghost" point (`_lastPoint`) currently following the cursor.
     *
     * @returns A composite array of {@link LineToolPoint}s.
     */
    points() {
        // Combine permanent points with the temporary last point if it exists
        const points = [...this._points, ...(this._lastPoint ? [this._lastPoint] : [])];
        // If pointsCount is -1 (for tools like Brush), return all points.
        // Otherwise, only return the number of points the tool is defined to have.
        return this.pointsCount === -1 ? points : points.slice(0, this.pointsCount);
    }
    /**
     * Retrieves the single temporary "ghost" point used for live preview during tool creation.
     *
     * @returns The last calculated {@link LineToolPoint} of the mouse position, or `null`.
     */
    getLastPoint() {
        return this._lastPoint;
    }
    /**
     * Sets or clears the temporary "ghost" point.
     *
     * Used during the tool creation process to show a live preview that follows the user's mouse.
     * Setting this immediately calls `_triggerChartUpdate`.
     *
     * @param point - The temporary {@link LineToolPoint}, or `null` to clear it.
     * @returns void
     */
    setLastPoint(point) {
        this._lastPoint = point;
        // Trigger a chart update to redraw the tool with its new ghost point
        this._triggerChartUpdate();
    }
    /**
     * Overwrites the entire array of permanent points defining the tool's geometry.
     *
     * This method is called during programmatic updates or when the entire tool is translated (moved).
     *
     * @param points - The new array of {@link LineToolPoint}s.
     * @returns void
     */
    setPoints(points) { this._points = points; }
    /**
     * Adds a new, permanent {@link LineToolPoint} to the end of the tool's point array.
     *
     * This is called by the {@link InteractionManager} when a user performs a click to commit a new point during creation.
     *
     * @param point - The {@link LineToolPoint} to add.
     * @returns void
     */
    addPoint(point) { this._points.push(point); }
    /**
     * Retrieves a permanent point from the internal array by its index.
     *
     * @param index - The zero-based index of the point.
     * @returns The requested {@link LineToolPoint}, or `null` if the index is out of bounds.
     */
    getPoint(index) { return this._points[index] || null; }
    /**
     * Updates a specific permanent point in the internal array with new logical coordinates.
     *
     * This method is called during editing (resizing) of a specific anchor point.
     *
     * @param index - The index of the point to modify.
     * @param point - The new {@link LineToolPoint} coordinates.
     * @returns void
     */
    setPoint(index, point) {
        if (this._points[index]) {
            this._points[index] = point;
        }
    }
    /**
     * Returns the number of permanently committed points currently defining the tool.
     *
     * This count excludes any temporary "ghost" point and is used by the {@link InteractionManager}
     * to decide the index of the next point to add.
     *
     * @returns The number of permanent points.
     */
    getPermanentPointsCount() {
        return this._points.length;
    }
    /**
     * Retrieves the complete and final configuration options object for this tool instance.
     *
     * This includes both the {@link LineToolOptionsCommon} and the tool-specific options.
     *
     * @returns The full options object.
     */
    options() {
        return this._options;
    }
    /**
     * Deeply merges a partial set of new options into the tool's current configuration.
     *
     * This is the core method for updating the tool's appearance programmatically. It automatically
     * triggers a full view update and a chart redraw after the merge is complete.
     *
     * @param options - A deep partial of the tool's options structure containing changes to be merged.
     * @returns void
     */
    applyOptions(options) {
        merge(this._options, options);
        this.updateAllViews();
        this._requestUpdate?.();
    }
    /**
     * Checks if the tool has acquired its minimum required number of permanent points.
     *
     * For bounded tools (`pointsCount > 0`), this returns true if `_points.length` meets `pointsCount`.
     * For unbounded tools (`pointsCount === -1`), this check typically passes early, deferring finalization to `getFinalizationMethod`.
     *
     * @returns `true` if the tool is ready to exit creation mode, `false` otherwise.
     */
    isFinished() {
        return this._points.length >= this.pointsCount;
    }
    /**
     * Attempts to transition the tool out of the `creating` state and into the `selected` state.
     *
     * This is called by the {@link InteractionManager} after a point is added. If `isFinished()` is true,
     * the creation state is reset, the selected state is set, and views are updated.
     *
     * @returns void
     */
    tryFinish() {
        if (this.isFinished()) {
            this._creating = false;
            this._editing = false;
            this.setSelected(true);
            this.updateAllViews();
            this._requestUpdate?.();
        }
    }
    /**
     * Generates the complete, serializable {@link LineToolExport} object representing the tool's current state.
     *
     * This is the fundamental data output used for API responses, event payloads, and state persistence.
     *
     * @returns The full export data object.
     */
    getExportData() {
        return {
            id: this.id(),
            toolType: this.toolType,
            points: this.points(),
            options: this.options(),
        };
    }
    // #endregion
    // #region ISeriesPrimitive implementation
    /**
     * Provides an array of pane view components to Lightweight Charts for rendering the tool's body.
     *
     * This implements the `ISeriesPrimitive` contract.
     *
     * @returns A readonly array of {@link IPaneView} components.
     */
    paneViews() {
        return this._paneViews;
    }
    /**
     * Signals that all associated view components (pane, price axis, time axis) need to update their internal data and caches.
     *
     * This method automatically triggers the synchronous update of the {@link PriceAxisLabelStackingManager}
     * to ensure correct vertical placement of labels before the next render.
     *
     * @returns void
     */
    updateAllViews() {
        // Update the main pane view(s) for the tool's body (the line, rectangle, etc.)
        this._paneViews.forEach(view => view.update());
        // For tools with a dynamic number of points (like Brush or Path),
        // the logic to match the number of views to points would go here.
        // Since we are focused on fixed-point tools for now, this part is simplified.
        if (this.pointsCount === -1) ;
        // Now, simply call update() on the persistent view instances.
        // These views were created once in the constructor.
        this._priceAxisLabelViews.forEach(view => view.update());
        this._timeAxisLabelViews.forEach(view => view.update());
        // Call Stacking Manager synchronously. It must run immediately after the view updates
        // to ensure the shifted Y-coordinate is available for the chart's paint cycle.
        this._priceAxisLabelStackingManager.updateStacking();
    }
    /**
     * Retrieves the color that should be used for the price axis label background.
     *
     * Concrete tools should override this to return a dynamic color based on the tool's current state (e.g., color of P0).
     *
     * @returns A color string (e.g., '#FF0000') or `null` if the label should not be visible.
     */
    priceAxisLabelColor() {
        // The view will check the active state. This method just needs to provide a color if labels are shown.
        // Returning a static color simplifies this, but tools can override for more complex behavior.
        return '#2962FF'; // Default active color
    }
    /**
     * Retrieves the color that should be used for the time axis label background.
     *
     * Concrete tools should override this to return a dynamic color based on the tool's current state (e.g., color of P0).
     *
     * @returns A color string (e.g., '#FF0000') or `null` if the label should not be visible.
     */
    timeAxisLabelColor() {
        // Same logic as priceAxisLabelColor
        return '#2962FF'; // Default active color
    }
    /**
     * Retrieves the Lightweight Charts Series API instance this tool is attached to.
     *
     * @returns The `ISeriesApi` instance.
     * @throws An error if the series has not been attached (e.g., in `detached` state).
     */
    getSeries() {
        if (!this._series) {
            throw new Error(`Series not attached to tool ${this.id()}. Cannot get series API.`);
        }
        return this._series;
    }
    /**
     * Retrieves the Lightweight Charts Chart API instance associated with this tool.
     *
     * @returns The `IChartApiBase` instance.
     * @throws An error if the chart API is not available.
     */
    getChart() {
        if (!this._chart) {
            throw new Error('Chart API not available. Tool might not be attached.');
        }
        return this._chart;
    }
    /**
     * Retrieves the chart's horizontal scale behavior instance.
     *
     * This object is critical for correctly converting time values (`Time`, `UTCTimestamp`, etc.)
     * to and from the generic `HorzScaleItem` type used by Lightweight Charts.
     *
     * @returns The `IHorzScaleBehavior` instance.
     * @throws An error if the scale behavior is not attached.
     */
    get horzScaleBehavior() {
        if (!this._horzScaleBehavior) {
            throw new Error(`Horizontal Scale Behavior not attached to tool ${this.id()}.`);
        }
        return this._horzScaleBehavior;
    }
    // #endregion
    // #region Utilities for subclasses
    /**
     * Transforms a logical data point (timestamp/price) into pixel screen coordinates.
     *
     * This utility handles the complex conversion, including interpolation for points
     * that lie in the chart's "blank logical space" (outside the available data bars).
     *
     * @param point - The logical {@link LineToolPoint} to convert.
     * @returns A {@link Point} with screen coordinates, or `null` if conversion fails.
     */
    pointToScreenPoint(point) {
        const timeScale = this._chart.timeScale();
        // CORRECTED: Assert point.timestamp as UTCTimestamp to match the 'Time' type expectation.
        const logicalIndex = interpolateLogicalIndexFromTime(this._chart, this._series, point.timestamp);
        if (logicalIndex === null) {
            console.warn(`[BaseLineTool] pointToScreenPoint: Could not determine logical index for timestamp: ${point.timestamp}.`);
            return null;
        }
        // Use logicalToCoordinate for x-coordinate based on the logical index.
        const x = timeScale.logicalToCoordinate(logicalIndex);
        // Use the series' priceToCoordinate method directly.
        const y = this._series.priceToCoordinate(point.price);
        // Ensure conversions were successful and resulted in valid coordinates.
        if (x === null || y === null) {
            console.warn(`[BaseLineTool] pointToScreenPoint: Coordinate conversion failed for point: ${JSON.stringify(point)}. Received x=${x}, y=${y}`);
            return null;
        }
        return new Point(x, y);
    }
    /**
     * Transforms a pixel screen coordinate into a logical data point (timestamp/price).
     *
     * This method is the inverse of `pointToScreenPoint` and is primarily used by the
     * {@link InteractionManager} to determine the final logical coordinates of a user click or drag.
     *
     * @param point - The {@link Point} with screen coordinates.
     * @returns A logical {@link LineToolPoint}, or `null` if conversion fails.
     */
    screenPointToPoint(point) {
        const timeScale = this._chart.timeScale();
        const price = this._series.coordinateToPrice(point.y);
        // Get the logical index from the screen X coordinate.
        const logical = timeScale.coordinateToLogical(point.x);
        if (logical === null) {
            return null;
        }
        // Use our interpolation function to get a timestamp from the logical index.
        // This handles cases where the logical position is in a "blank" area.
        const interpolatedTime = interpolateTimeFromLogicalIndex(this._chart, this._series, logical);
        if (interpolatedTime === null || price === null) {
            console.warn(`[BaseLineTool] screenPointToPoint: Could not determine interpolated time or price for screen point: ${JSON.stringify(point)}.`);
            return null;
        }
        return {
            timestamp: this._horzScaleBehavior.key(interpolatedTime),
            price: price,
        };
    }
    /**
     * Sets the internal array of pane view components.
     *
     * This protected method is called by the concrete line tool's `constructor` or `updateAllViews`
     * to define what graphical elements (lines, shapes, text, etc.) will be rendered.
     *
     * @param views - An array of {@link IUpdatablePaneView} instances.
     * @protected
     */
    _setPaneViews(views) {
        this._paneViews = views;
    }
    /**
     * Assigns the tool's final and complete configuration options.
     *
     * Concrete tool implementations use this during construction, ensuring the base class
     * always holds a unique, finalized options object.
     *
     * @param finalOptions - The complete options object.
     * @protected
     */
    _setupOptions(finalOptions) {
        // Base tool just assigns the options object, assuming it is unique and complete.
        this._options = finalOptions;
    }
    // #endregion
    /**
     * Cleans up and releases all resources held by the line tool instance.
     *
     * This is the final internal cleanup hook called by the {@link LineToolsCorePlugin} when the tool is removed.
     * It ensures memory safety by:
     * 1. Unregistering all price axis labels from the stacking manager.
     * 2. Clearing all internal view and point references.
     * 3. Nullifying the price scale.
     *
     * @returns void
     */
    destroy() {
        console.log(`[BaseLineTool] Destroying tool with ID: ${this.id()}`);
        this._isDestroying = true;
        // Immediately request an update so the chart knows to stop using my views
        // This is done BEFORE unregistering from the stacking manager which will trigger its own update
        this._triggerChartUpdate();
        // Unregister all price axis labels associated with this tool from the stacking manager
        this._priceAxisLabelViews.forEach(view => {
            if (view instanceof LineToolPriceAxisLabelView) {
                // The ID used for registration is toolId + '-p' + pointIndex (see LineToolPriceAxisLabelView)
                this._priceAxisLabelStackingManager.unregisterLabel(this.id() + '-p' + view.getPointIndex());
            }
        });
        // Trigger a stacking update to re-flow remaining labels after this tool's labels are removed
        this._priceAxisLabelStackingManager.updateStacking();
        // Clear references to views and internal data
        this._paneViews.forEach(paneView => {
            const renderer = paneView.renderer();
            if (renderer && renderer.clear) { // Check if the renderer has a clear method
                renderer.clear();
            }
        });
        this._paneViews = []; // Breaks references to renderers and views
        this._points = [];
        this._lastPoint = null;
        // Clear price scale reference
        this.setPriceScale(null); // Will set this._priceScale = null
        // Reset interaction states
        this._selected = false;
        this._hovered = false;
        this._editing = false;
        this._creating = false;
        this._editedPointIndex = null;
        this._currentPoint = new Point(0, 0); // Reset Point instance (or nullify)
        // Note: The `detached()` method will handle nullifying references to external LWCharts APIs.
        // We do not call `this.detached()` here as `detached()` is part of the `ISeriesPrimitive` lifecycle
        // managed by LWCharts, and `destroy` is our plugin's internal cleanup hook.
        // When our `InteractionManager.detachTool` is called, it will eventually lead to LWCharts calling `detached()`.
    }
    /**
     * Triggers a chart update (redraw) via the internal `requestUpdate` callback.
     *
     * This is the standard mechanism for the tool to force the chart to redraw itself
     * after a state change that affects its visual output.
     *
     * @internal
     * @returns void
     */
    _triggerChartUpdate() {
        if (this._requestUpdate) { // Use the existing _requestUpdate property
            this._requestUpdate();
            //console.log(`[BaseLineTool] Triggering chart update for tool ${this.id()}.`);
        }
        else {
            console.warn(`[BaseLineTool] Attempted to trigger chart update for tool ${this.id()} but _requestUpdate is not set.`);
        }
    }
    /**
     * Implements the `IDataSource` method for the base value.
     *
     * For line tools, this typically has no meaning and returns 0.
     *
     * @returns The base value (0).
     */
    base() {
        // Line tools typically don't have a 'base' in the same way a histogram does.
        return 0;
    }
    /**
     * Provides autoscale information for the primitive, implementing the `IDataSource` contract.
     *
     * By default, line tools do not influence the chart's autoscale range, and this method returns `null`.
     * Tools that need to affect the autoscale (e.g., specialized markers) must override this.
     *
     * @param startTimePoint - The logical index of the start of the visible range.
     * @param endTimePoint - The logical index of the end of the visible range.
     * @returns An {@link AutoscaleInfo} object if the tool affects the scale, or `null`.
     */
    autoscaleInfo(startTimePoint, endTimePoint) {
        // Line tools do not participate in autoscale by default.
        // If a specific tool needs to, it should override this method.
        // The AutoscaleInfoImpl provides a .toRaw() method to convert to the expected AutoscaleInfo interface.
        return null; // Returning null for no autoscale influence by default.
    }
    /**
     * Implements the `IDataSource` method for providing the price scale's first value.
     *
     * This is primarily used for features like percentage-based price scales. For general line tools,
     * this is typically not applicable.
     *
     * @returns The {@link FirstValue} object, or `null`.
     */
    firstValue() {
        // This can be enhanced later if tools need to influence the price scale formatting.
        return null;
    }
    /**
     * Provides an {@link IPriceFormatter} for this tool, implementing the `IDataSource` contract.
     *
     * This is usually a no-op formatter as the underlying series' formatter is preferred.
     *
     * @returns A basic {@link IPriceFormatter} implementation.
     */
    formatter() {
        // Return a default formatter that satisfies the IPriceFormatter interface.
        // The actual series' formatter will be used for display.
        return {
            format: (price) => price.toString(), // Basic string conversion for format
            formatTickmarks: (prices) => prices.map(p => p.toString()) // Basic string conversion for tickmarks
        };
    }
    /**
     * Implements the `IDataSource` method to provide a price line color.
     *
     * This is typically not used for line tools and returns an empty string.
     *
     * @param lastBarColor - The color of the last bar in the series (unused).
     * @returns An empty string.
     */
    priceLineColor(lastBarColor) {
        // Not applicable for line tools.
        return '';
    }
    /**
     * OPTIONAL: Indicates if dragging the first anchor point (index 0) of an unbounded tool (e.g., Brush)
     * should be treated as a full tool translation (move) rather than just a point edit.
     *
     * This is used by the {@link InteractionManager} to distinguish the drag behavior of tools like Brush vs. Path.
     *
     * @returns `true` if dragging anchor 0 should translate the whole tool, `false` otherwise.
     */
    anchor0TriggersTranslation() {
        // Default to false. Path Tool inherits this.
        return false;
    }
    /**
     * OPTIONAL: Hook for tools that finalize creation on a double-click (e.g., Path tool).
     *
     * This allows the tool to perform specific cleanup (like removing the last "rogue" point added
     * on the final single click before the double-click) before the creation process concludes.
     *
     * @returns The instance of the tool (for method chaining).
     */
    handleDoubleClickFinalization() {
        return this; // Default is no operation.
    }
    /**
     * Returns the method a user must employ to signal the end of the tool's creation process.
     *
     * Concrete tools must override this if they don't finalize automatically when `pointsCount` is reached.
     *
     * @returns The required {@link FinalizationMethod} (e.g., `MouseUp`, `DoubleClick`, or `PointCount`).
     */
    getFinalizationMethod() {
        return FinalizationMethod.PointCount;
    }
    /**
     * Retrieves the complete array of permanent points that should be translated when the tool is moved.
     *
     * This is used by the {@link InteractionManager} to get a stable snapshot of all points
     * for calculating logical translation vectors.
     *
     * @returns An array of permanent {@link LineToolPoint}s.
     */
    getPermanentPointsForTranslation() {
        // Return a copy to ensure external modifications do not corrupt internal state
        return [...this._points];
    }
    /**
     * Clears the temporary "ghost" point (`_lastPoint`), ensuring it is no longer rendered.
     *
     * This is called by the {@link InteractionManager} upon finalization of the tool's creation.
     *
     * @returns void
     */
    clearGhostPoint() {
        this._lastPoint = null;
    }
    /**
     * Retrieves the pixel width of the chart pane's central drawing area.
     *
     * This width excludes the left and right price axes, giving the usable horizontal space.
     * It is used for calculating the extent of lines that should span the full width.
     *
     * @returns The pixel width of the drawing area.
     */
    getChartDrawingWidth() {
        // Assumption: this._chart (IChartApiBase) exposes paneSize() which returns a PaneSize object {width, height}.
        const paneDimensions = this._chart.paneSize();
        return paneDimensions.width;
    }
    /**
     * Retrieves the pixel height of the chart pane's central drawing area.
     *
     * This height excludes the top and bottom margins as well as the time scale area,
     * giving the usable vertical space within the pane.
     *
     * @returns The pixel height of the drawing area.
     */
    getChartDrawingHeight() {
        // Assumption: this._chart (IChartApiBase) exposes paneSize() which returns a PaneSize object {width, height}.
        const paneDimensions = this._chart.paneSize();
        return paneDimensions.height;
    }
}

// /src/rendering/line-anchor-renderer.ts
//GOTCHA im having an issue with when hovering over the rectangle perimiter the pointer is one thing, and then i move and hover
// to an anchor, the pointer does not seem to respect the anchors pointer definition. its like a drawing timing issue, or z depth?
//but if i hover off the line then back onto the anchor, then the pointer is correct.  increasing anchor larger does not seem to fix it.
const interactionTolerance$1 = {
    //anchor: 5, // Pixel tolerance for clicking on an anchor
    anchor: 8,
};
/**
 * Extends the base {@link Point} class to include necessary metadata for an interactive anchor handle.
 *
 * This point represents the screen coordinates of a resize/edit handle, along with data
 * about its type, index in the tool's point array, and specific cursor requirements.
 */
class AnchorPoint extends Point {
    /**
     * Initializes a new Anchor Point.
     *
     * @param x - The X-coordinate in pixels.
     * @param y - The Y-coordinate in pixels.
     * @param data - The index of this point in the parent tool's point array.
     * @param square - If `true`, the anchor is drawn as a square; otherwise, it is a circle.
     * @param specificCursor - An optional, specific cursor to display when hovering over this anchor.
     */
    constructor(x, y, data, square = false, specificCursor) {
        super(x, y);
        this.data = data;
        this.square = square;
        this.specificCursor = specificCursor;
    }
    /**
     * Creates a deep copy of the anchor point, preserving all metadata.
     * @returns A new {@link AnchorPoint} instance.
     */
    clone() {
        return new AnchorPoint(this.x, this.y, this.data, this.square, this.specificCursor);
    }
}
/**
 * Renders the interactive anchor points (resize/edit handles) for a line tool.
 *
 * It draws the small square or circle handles that appear when a tool is selected
 * and performs the highly sensitive hit testing required for dragging these handles.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class LineAnchorRenderer {
    /**
     * Initializes the Anchor Renderer.
     *
     * @param chart - The Lightweight Charts chart API instance (for context/API access).
     * @param data - Optional initial {@link LineAnchorRendererData} to set.
     */
    constructor(chart, data) {
        /**
         * Internal data payload.
         * @internal
         */
        this._data = null;
        this._chart = chart;
        this._data = data ?? null;
    }
    /**
     * Overwrites the entire data payload for the renderer.
     * @param data - The new {@link LineAnchorRendererData}.
     * @returns void
     */
    setData(data) {
        this._data = data;
    }
    /**
     * Partially updates the current data payload by merging a set of changes.
     * @param data - A partial update object for the {@link LineAnchorRendererData}.
     * @returns void
     */
    updateData(data) {
        if (this._data) {
            this._data = merge(this._data, data);
        }
    }
    /**
     * Draws all configured anchor points (circles or squares) onto the chart pane.
     *
     * It uses helper drawing functions (`drawCircleBody`, `drawRectBody`) to render
     * the main handle and applies special effects (shadows/halos) if the anchor is hovered.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (!this._data || !this._data.visible) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            const squarePoints = [];
            const squareColors = [];
            const circlePoints = [];
            const circleColors = [];
            for (let e = 0; e < this._data.points.length; ++e) {
                const point = this._data.points[e];
                const color = this._data.backgroundColors[e];
                if (point.square) {
                    squarePoints.push(point);
                    squareColors.push(color);
                }
                else {
                    circlePoints.push(point);
                    circleColors.push(color);
                }
            }
            ctx.strokeStyle = this._data.color;
            if (squarePoints.length) {
                this._drawPoints(ctx, squarePoints, squareColors, drawRectBody, drawRectShadow);
            }
            if (circlePoints.length) {
                this._drawPoints(ctx, circlePoints, circleColors, drawCircleBody, drawCircleShadow);
            }
        });
    }
    /**
     * Performs a hit test specifically over the anchor points.
     *
     * This logic uses an augmented radius (`this._data.radius + interactionTolerance.anchor`)
     * to create a larger, forgiving target area for the user to click/drag.
     * It determines the specific anchor index hit and the appropriate cursor type (e.g., 'resize').
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns A {@link HitTestResult} containing the anchor index and cursor, or `null`.
     */
    hitTest(x, y) {
        // [FIX] Allow hit-testing even if visually hidden (unselected).
        // This allows the user to find the anchor (resize cursor) even if they haven't 
        // clicked the tool to select it yet.
        if (this._data === null) {
            return null;
        }
        const position = new Point(x, y);
        // Define the hit threshold once (Radius + Tolerance)
        // Ensure 'interactionTolerance.anchor' is defined at the top of your file (e.g., set to 8 or 10)
        const hitThreshold = this._data.radius + interactionTolerance$1.anchor;
        for (let i = 0; i < this._data.points.length; ++i) {
            const point = this._data.points[i];
            // Calculate distance from mouse to anchor center
            const distance = point.subtract(position).length();
            // Check distance against the calculated threshold
            if (distance <= hitThreshold) {
                // Determine the suggested cursor based on hierarchy
                let suggestedCursor = PaneCursorType.Default;
                // Priority 1: Specific cursor defined on the individual anchor point (e.g., nwse-resize)
                if (point.specificCursor) {
                    suggestedCursor = point.specificCursor;
                }
                // Priority 2: Default anchor hover cursor defined for the whole tool
                else if (this._data.defaultAnchorHoverCursor) {
                    suggestedCursor = this._data.defaultAnchorHoverCursor;
                }
                // Priority 3: Fallback for ChangePoint hit type (standard resize)
                else if (this._data.hitTestType === HitTestType.ChangePoint) {
                    suggestedCursor = PaneCursorType.DiagonalNwSeResize;
                }
                // Priority 4: Generic pointer fallback
                else {
                    suggestedCursor = PaneCursorType.Pointer;
                }
                const pointIndex = point.data;
                // Return the hit result immediately
                return new HitTestResult(this._data.hitTestType, { pointIndex, suggestedCursor });
            }
        }
        return null;
    }
    /**
     * Internal helper to iterate over a list of points (either circles or squares) and draw their bodies and hover shadows.
     *
     * This abstracts the logic for drawing the shape itself (`drawBody`) and applying the hover effect (`drawShadow`).
     *
     * @param ctx - The CanvasRenderingContext2D.
     * @param points - The array of {@link AnchorPoint}s to draw.
     * @param colors - The array of corresponding background colors.
     * @param drawBody - The callback function to draw the main body of the shape.
     * @param drawShadow - The callback function to draw the hover shadow/halo.
     * @private
     */
    _drawPoints(ctx, points, colors, drawBody, drawShadow) {
        const data = this._data;
        const currentPoint = data.currentPoint;
        let lineWidth = Math.max(1, Math.floor(data.strokeWidth || 2));
        if (data.selected) {
            lineWidth += 1;
        }
        const radius = data.radius * 2; // Make radius bigger for better visibility
        for (let d = 0; d < points.length; ++d) {
            const point = points[d];
            ctx.fillStyle = colors[d];
            if (!(Number.isInteger(point.data) && data.editedPointIndex === point.data)) {
                drawBody(ctx, point, radius / 2, lineWidth);
                if (point.subtract(currentPoint).length() <= data.radius + interactionTolerance$1.anchor) {
                    const hoveredLineWidth = Math.max(1, data.hoveredStrokeWidth);
                    drawShadow(ctx, point, radius / 2, hoveredLineWidth);
                }
            }
        }
    }
}
/**
 * Draws the path for a rectangular anchor handle.
 *
 * This function calculates the correct dimensions to center the rectangle path around the point
 * while accounting for the border line width.
 *
 * @param ctx - The CanvasRenderingContext2D.
 * @param point - The center {@link Point} of the rectangle.
 * @param radius - The base size of the anchor (half-width/height).
 * @param lineWidth - The stroke width for the border.
 * @returns void
 */
function drawRect(ctx, point, radius, lineWidth) {
    ctx.lineWidth = lineWidth;
    const n = radius + lineWidth / 2;
    drawRoundRect(ctx, point.x - n, point.y - n, 2 * n, 2 * n, (radius + lineWidth) / 2, LineStyle.Solid);
    ctx.closePath();
}
/**
 * Draws the hover shadow/halo for a rectangular anchor handle.
 *
 * It uses a reduced alpha value to create a semi-transparent border effect.
 *
 * @param ctx - The CanvasRenderingContext2D.
 * @param point - The center {@link Point} of the anchor.
 * @param radius - The base size of the anchor.
 * @param lineWidth - The width of the shadow line.
 * @returns void
 */
function drawRectShadow(ctx, point, radius, lineWidth) {
    ctx.globalAlpha = 0.2;
    drawRect(ctx, point, radius, lineWidth);
    ctx.stroke();
    ctx.globalAlpha = 1;
}
/**
 * Draws the main filled body and stroke of a rectangular anchor handle.
 *
 * @param ctx - The CanvasRenderingContext2D.
 * @param point - The center {@link Point} of the anchor.
 * @param radius - The base size of the anchor.
 * @param lineWidth - The stroke width for the border.
 * @returns void
 */
function drawRectBody(ctx, point, radius, lineWidth) {
    drawRect(ctx, point, radius - lineWidth, lineWidth);
    ctx.fill();
    ctx.stroke();
}
/**
 * Draws the hover shadow/halo for a circular anchor handle.
 *
 * It uses a reduced alpha value to create a semi-transparent border effect.
 *
 * @param ctx - The CanvasRenderingContext2D.
 * @param point - The center {@link Point} of the anchor.
 * @param radius - The base size of the anchor.
 * @param lineWidth - The width of the shadow line.
 * @returns void
 */
function drawCircleShadow(ctx, point, radius, lineWidth) {
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + lineWidth / 2, 0, 2 * Math.PI, true);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
}
/**
 * Draws the main filled body and stroke of a circular anchor handle.
 *
 * @param ctx - The CanvasRenderingContext2D.
 * @param point - The center {@link Point} of the anchor.
 * @param radius - The base size of the anchor.
 * @param lineWidth - The stroke width for the border.
 * @returns void
 */
function drawCircleBody(ctx, point, radius, lineWidth) {
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius - lineWidth / 2, 0, 2 * Math.PI, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

// /src/rendering/generic-renderers.ts
/**
 * This file contains a collection of generic and reusable canvas renderers for
 * common geometric shapes and text, which can be composited to build complex line tools.
 * Each renderer is designed to be fully configurable via its setData() method.
 */
// Common interaction tolerance for hit-testing lines and borders
const interactionTolerance = {
    line: 4, // Make the line hit-test a bit more forgiving
};
/**
 * Renders a single straight line segment between two points.
 *
 * This renderer is highly versatile, supporting infinite extensions (Rays, Extended Lines, Horizontal/Vertical Lines),
 * line dashing/styling, and custom end caps (Arrows, Circles). It implements robust hit testing along the line path.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class SegmentRenderer {
    /**
     * Initializes the Segment Renderer.
     *
     * @param hitTest - An optional, pre-configured {@link HitTestResult} template that will be returned on a successful hit.
     */
    constructor(hitTest) {
        this._data = null;
        this._mediaSize = { width: 0, height: 0 };
        this._hitTest = hitTest || new HitTestResult(HitTestType.MovePoint);
    }
    /**
     * Sets the data payload required to draw and hit-test the segment.
     *
     * @param data - The {@link SegmentRendererData} containing the points and styling options.
     * @returns void
     */
    setData(data) {
        this._data = data;
    }
    /**
     * Draws the line segment onto the chart pane.
     *
     * This method calculates any necessary line extensions or viewport clipping before drawing
     * the final segment, ensuring that the line stays within the visible area.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (!this._data || !this._data.points || this._data.points.length < 2) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            this._mediaSize = mediaSize; // Store mediaSize for hitTest
            const { line, points } = this._data;
            const [point0, point1] = points;
            // Ensure LineWidth is treated as a number for ctx.lineWidth
            const lineWidth = line.width || 1;
            const lineColor = line.color || 'white';
            const lineStyle = line.style || LineStyle.Solid;
            ctx.lineCap = line.cap || 'butt'; // Apply lineCap from options, default to 'butt'
            ctx.lineJoin = line.join || 'miter'; // Apply lineJoin from options, default to 'miter'
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = lineWidth;
            setLineStyle(ctx, lineStyle);
            // Draw line caps (arrows, circles) based on EndOptions
            // drawArrowEnd and drawCircleEnd assume ctx.lineWidth has been set.
            this._drawEnds(ctx, points, lineWidth, lineStyle); // Pass lineStyle to drawArrowEnd
            // Extend and clip the line segment based on options
            const extendedClippedSegment = extendAndClipLineSegment(point0, point1, mediaSize.width, mediaSize.height, !!line.extend?.left, // Convert boolean to real boolean
            !!line.extend?.right // Convert boolean to real boolean
            );
            if (extendedClippedSegment !== null && lineWidth > 0) {
                if (extendedClippedSegment instanceof Point) {
                    // Segment degenerated to a single point. Do not draw a line.
                    return;
                }
                const [start, end] = extendedClippedSegment; // Safe destructuring as it's not a Point
                // Use generic drawLine, which correctly picks solid/dashed
                // drawVerticalLine and drawHorizontalLine do not take style, they are low-level pixel operations
                // TEXT GAP: if textGap provided, draw two segments with a gap
                if (this._data.textGap) {
                    const g = this._data.textGap;
                    const PAD = 1.5;
                    const gL = g.cx - g.halfW - PAD;
                    const gR = g.cx + g.halfW + PAD;
                    const dxL = end.x - start.x;
                    if (Math.abs(dxL) > 0.1) {
                        const t1 = (gL - start.x) / dxL;
                        const t2 = (gR - start.x) / dxL;
                        // First segment: start -> gap (only if gap is not at the very start)
                        if (t1 > 0.001) {
                            const p1x = start.x + t1*dxL;
                            const p1y = start.y + t1*(end.y-start.y);
                            drawLine(ctx, start.x, start.y, p1x, p1y, lineStyle);
                        }
                        // Second segment: gap -> end (only if gap is not at the very end)
                        if (t2 < 0.999) {
                            const p2x = start.x + t2*dxL;
                            const p2y = start.y + t2*(end.y-start.y);
                            drawLine(ctx, p2x, p2y, end.x, end.y, lineStyle);
                        }
                    } else {
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
     * Performs a hit test along the entire rendered path of the line segment.
     *
     * This includes any extended or clipped portions of the line, providing a large enough
     * tolerance to make clicking on the line easy.
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns A {@link HitTestResult} if the coordinates are within the line's tolerance, otherwise `null`.
     */
    hitTest(x, y) {
        if (!this._data || this._data.points.length < 2 || !this._mediaSize.width || !this._mediaSize.height) {
            return null;
        }
        const { line, points, toolDefaultHoverCursor } = this._data;
        const [point0, point1] = points;
        const extendedClippedSegment = extendAndClipLineSegment(point0, point1, this._mediaSize.width, this._mediaSize.height, !!line.extend?.left, !!line.extend?.right);
        if (extendedClippedSegment === null) {
            return null;
        }
        if (extendedClippedSegment instanceof Point) {
            if (extendedClippedSegment.subtract(new Point(x, y)).length() <= interactionTolerance.line) {
                const suggestedCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
                return new HitTestResult(this._hitTest.type(), { pointIndex: null, suggestedCursor });
            }
            return null;
        }
        // If it's a Segment (array of two points), proceed with segment hit-test.
        const [start, end] = extendedClippedSegment;
        if (distanceToSegment(start, end, new Point(x, y)).distance <= interactionTolerance.line) {
            const suggestedCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
            return new HitTestResult(this._hitTest.type(), { pointIndex: null, suggestedCursor });
        }
        return null;
    }
    /**
     * Helper method to draw the decorative end caps (Arrow, Circle) specified in the `LineOptions`.
     *
     * This is performed before the main line segment to ensure Z-order correctness.
     *
     * @param ctx - The CanvasRenderingContext2D.
     * @param points - The two defining points of the line.
     * @param width - The line width for sizing the end caps.
     * @param style - The line style, passed for correct arrow dashing consistency.
     * @private
     */
    _drawEnds(ctx, points, width, style) {
        const lineOptions = this._data?.line;
        if (!lineOptions)
            return;
        // Note: drawArrowEnd needs the style to ensure consistent dashing for the arrow itself.
        if (lineOptions.end?.left === LineEnd.Arrow) {
            drawArrowEnd(points[1], points[0], ctx, width, style);
        }
        else if (lineOptions.end?.left === LineEnd.Circle) {
            drawCircleEnd(points[0], ctx, width);
        }
        if (lineOptions.end?.right === LineEnd.Arrow) {
            drawArrowEnd(points[0], points[1], ctx, width, style);
        }
        else if (lineOptions.end?.right === LineEnd.Circle) {
            drawCircleEnd(points[1], ctx, width);
        }
    }
}
/**
 * Renders an open or closed shape/path defined by an array of points.
 *
 * This is used for complex freehand tools like Brush, Highlighter, and Path/Polyline.
 * It supports drawing the line perimeter, filling the background, and defining line end decorations.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class PolygonRenderer {
    /**
     * Initializes the Polygon Renderer.
     *
     * @param hitTest - An optional, pre-configured {@link HitTestResult} template that will be returned on a successful hit.
     */
    constructor(hitTest) {
        this._data = null;
        this._mediaSize = { width: 0, height: 0 };
        this._hitTest = hitTest || new HitTestResult(HitTestType.MovePoint);
    }
    /**
     * Sets the data payload required to draw and hit-test the polygon.
     *
     * @param data - The {@link PolygonRendererData} containing the points and styling options.
     * @returns void
     */
    setData(data) {
        this._data = data;
    }
    /**
     * Draws the polygon path, including drawing the background fill and stroking the line perimeter.
     *
     * This handles both open paths (Polyline, Brush) and closed shapes (if `enclosePerimeterWithLine` is set).
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (!this._data || !this._data.points || this._data.points.length < 1) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            this._mediaSize = mediaSize; // Store mediaSize for hitTest
            const { line, background, points } = this._data;
            const pointsCount = points.length; // Get points count
            ctx.beginPath();
            ctx.lineCap = line.cap || 'butt'; // Apply lineCap from options
            ctx.lineJoin = line.join || 'miter'; // Apply lineJoin from options
            ctx.lineWidth = line.width || 1; // Ensure LineWidth is number
            ctx.strokeStyle = line.color || 'white';
            setLineStyle(ctx, line.style || LineStyle.Solid); // Apply lineStyle
            ctx.moveTo(points[0].x, points[0].y);
            for (const point of points) {
                ctx.lineTo(point.x, point.y);
            }
            if (background?.color) { // Apply background color from options
                ctx.fillStyle = background.color;
                ctx.fill();
            }
            if (this._data.enclosePerimeterWithLine) {
                ctx.closePath();
            }
            if (ctx.lineWidth > 0) {
                ctx.stroke();
            }
            // LINE ENDS (ARROWHEAD) START
            if (pointsCount >= 2) {
                const startPoint = points[0]; // P0
                const secondPoint = points[1]; // P1
                const endPoint = points[pointsCount - 1]; // Pn
                const segmentStart = points[pointsCount - 2]; // Pn-1
                const lineWidth = line.width || 1;
                const style = line.style || LineStyle.Solid;
                // End of Path (line.end.right) - Pointing at Pn
                if (line.end?.right === LineEnd.Arrow) {
                    // drawArrowEnd(tail, head, ctx, width, style)
                    drawArrowEnd(segmentStart, endPoint, ctx, lineWidth, style);
                }
                else if (line.end?.right === LineEnd.Circle) {
                    drawCircleEnd(endPoint, ctx, lineWidth);
                }
                // Start of Path (line.end.left) - Pointing at P0
                if (line.end?.left === LineEnd.Arrow) {
                    // drawArrowEnd(tail, head, ctx, width, style) -> Draw arrow pointing from P1 to P0
                    drawArrowEnd(secondPoint, startPoint, ctx, lineWidth, style);
                }
                else if (line.end?.left === LineEnd.Circle) {
                    drawCircleEnd(startPoint, ctx, lineWidth);
                }
            }
            //LINE ENDS (ARROWHEAD) END		
        });
    }
    /**
     * Performs a hit test on the polygon's line segments and its optional background fill area.
     *
     * For fills, it uses the robust ray casting algorithm (`pointInPolygon`) to check for hits.
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns A {@link HitTestResult} if the polygon is hit, otherwise `null`.
     */
    hitTest(x, y) {
        if (!this._data || !this._data.points || this._data.points.length < 1 || !this._mediaSize.width || !this._mediaSize.height) {
            return null;
        }
        const point = new Point(x, y);
        const { points, background, hitTestBackground, toolDefaultHoverCursor, toolDefaultDragCursor } = this._data; // NEW: Get default cursors
        // Hit test line segments (perimeter)
        for (let i = 1; i < points.length; i++) {
            if (distanceToSegment(points[i - 1], points[i], point).distance <= interactionTolerance.line) {
                const suggestedCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
                return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor });
            }
        }
        // Also check from last point to first point to close the shape for hit testing
        if (points.length > 2 && distanceToSegment(points[points.length - 1], points[0], point).distance <= interactionTolerance.line) {
            const suggestedCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor });
        }
        // Hit test background
        if (hitTestBackground && background?.color && points.length > 2 && pointInPolygon(point, points)) {
            const suggestedCursor = toolDefaultDragCursor || PaneCursorType.Grabbing;
            return new HitTestResult(HitTestType.MovePointBackground, { pointIndex: null, suggestedCursor });
        }
        return null;
    }
}
/**
 * Renders an axis-aligned rectangular shape.
 *
 * This renderer is primarily used for the Rectangle drawing tool, as well as for drawing the
 * background fills of range tools like Fib Retracements and Price Ranges.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class RectangleRenderer {
    /**
     * Initializes the Rectangle Renderer.
     *
     * @param hitTest - An optional, pre-configured {@link HitTestResult} template that will be returned on a successful hit.
     */
    constructor(hitTest) {
        this._data = null;
        this._mediaSize = { width: 0, height: 0 };
        this._hitTest = hitTest || new HitTestResult(HitTestType.MovePoint);
    }
    /**
     * Sets the data payload required to draw and hit-test the rectangle.
     *
     * @param data - The {@link RectangleRendererData} containing the points and styling options.
     * @returns void
     */
    setData(data) {
        this._data = data;
    }
    /**
     * Draws the rectangle onto the chart pane, handling background fill, borders, and horizontal extensions.
     *
     * This relies on the core `fillRectWithBorder` canvas helper for drawing the shape with proper pixel alignment.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (!this._data || this._data.points.length < 2)
            return;
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            this._mediaSize = mediaSize; // Store mediaSize for hitTest
            const { border, background, extend, points } = this._data;
            const [point0, point1] = points;
            const borderWidth = border?.width || 0;
            const borderColor = border?.color;
            const backgroundColor = background?.color;
            const borderStyle = border?.style || LineStyle.Solid;
            const borderRadius = border?.radius || 0;
            if (borderWidth <= 0 && !backgroundColor)
                return; // Nothing to draw
            // Call fillRectWithBorder, passing all relevant options
            fillRectWithBorder(ctx, point0, point1, backgroundColor, borderColor, borderWidth, borderStyle, borderRadius, 'center', // Border alignment, often 'center' for rects
            !!extend?.left, !!extend?.right, mediaSize.width);
        });
    }
    /**
     * Performs a hit test on the four border segments and the optional background fill area of the rectangle.
     *
     * It correctly accounts for horizontal extensions when checking the top and bottom borders.
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns A {@link HitTestResult} if the rectangle is hit, otherwise `null`.
     */
    hitTest(x, y) {
        //console.log(`[RectangleRenderer] hitTest called at X:${x}, Y:${y}`);
        // FIX: Corrected initial null/data/point length check
        if (!this._data || this._data.points.length < 2 || !this._mediaSize.width || !this._mediaSize.height) {
            return null;
        }
        const { extend, points, hitTestBackground, toolDefaultHoverCursor, toolDefaultDragCursor } = this._data;
        const [point0, point1] = points;
        // Extract min/max values for coordinates, ensuring they are typed as Coordinate again
        const minX = Math.min(point0.x, point1.x);
        const maxX = Math.max(point0.x, point1.x);
        const minY = Math.min(point0.y, point1.y);
        const maxY = Math.max(point0.y, point1.y);
        const clickedPoint = new Point(x, y);
        const lineTolerance = interactionTolerance.line;
        // Re-calculate the specific corner points as Coordinates
        const topLeft = new Point(minX, minY);
        const topRight = new Point(maxX, minY);
        const bottomLeft = new Point(minX, maxY);
        const bottomRight = new Point(maxX, maxY);
        // Hit-testing the actual segments of the rectangle's border
        // Note: extend?.left/right are booleans, so the !! conversion is fine.
        // The logic can be simplified by defining temporary points for start/end of segment for hit test.
        // Hit-testing the actual segments of the rectangle's border
        const suggestedHoverCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
        // Top line: check between (minX, minY) and (maxX, minY), with extension accounted for
        const htTopLeft = new Point(extend?.left ? 0 : minX, minY);
        const htTopRight = new Point(extend?.right ? this._mediaSize.width : maxX, minY);
        if (distanceToSegment(htTopLeft, htTopRight, clickedPoint).distance <= lineTolerance) {
            //console.log(`[RectangleRenderer] *** HIT DETECTED on top border! Suggesting cursor: ${suggestedHoverCursor}`);
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor: suggestedHoverCursor });
        }
        // Bottom line: check between (minX, maxY) and (maxX, maxY), with extension accounted for
        const htBottomLeft = new Point(extend?.left ? 0 : minX, maxY);
        const htBottomRight = new Point(extend?.right ? this._mediaSize.width : maxX, maxY);
        if (distanceToSegment(htBottomLeft, htBottomRight, clickedPoint).distance <= lineTolerance) {
            //console.log(`[RectangleRenderer] *** HIT DETECTED on bottom border! Suggesting cursor: ${suggestedHoverCursor}`);
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor: suggestedHoverCursor });
        }
        // Left line: check between (minX, minY) and (minX, maxY) (no horizontal extension here for vertical lines)
        if (distanceToSegment(topLeft, bottomLeft, clickedPoint).distance <= lineTolerance) {
            //console.log(`[RectangleRenderer] *** HIT DETECTED on left border! Suggesting cursor: ${suggestedHoverCursor}`);
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor: suggestedHoverCursor });
        }
        // Right line: check between (maxX, minY) and (maxX, maxY) (no horizontal extension here for vertical lines)
        if (distanceToSegment(topRight, bottomRight, clickedPoint).distance <= lineTolerance) {
            //console.log(`[RectangleRenderer] *** HIT DETECTED on right border! Suggesting cursor: ${suggestedHoverCursor}`);
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor: suggestedHoverCursor });
        }
        // Check if point is inside the rectangle (for background hit)
        // FIX: Corrected Box constructor call to pass two Point objects
        if (hitTestBackground && pointInBox(clickedPoint, new Box(topLeft, bottomRight))) {
            const suggestedDragCursor = toolDefaultDragCursor || PaneCursorType.Grabbing;
            //console.log(`[RectangleRenderer] *** HIT DETECTED on background! Suggesting cursor: ${suggestedDragCursor}`);
            return new HitTestResult(HitTestType.MovePointBackground, { pointIndex: null, suggestedCursor: suggestedDragCursor });
        }
        return null;
    }
}
// #endregion Internal Interfaces
// #region Text Renderer
// =================================================================================================================
// Used for drawing text labels with boxes, rotation, etc.
/**
 * Renders complex text and its surrounding box.
 *
 * This powerful renderer supports multi-line word wrapping, custom alignment to a parent rectangle,
 * rotation, scaling, borders, background fills, and drop shadows, making it suitable for all text-based tools.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class TextRenderer {
    /**
     * Initializes the Text Renderer.
     *
     * @param hitTest - An optional, pre-configured {@link HitTestResult} template.
     */
    constructor(hitTest) {
        this._internalData = null;
        this._polygonPoints = null;
        this._linesInfo = null;
        this._fontInfo = null;
        this._boxSize = null;
        // _data is already present from previous implementation
        this._data = null;
        this._mediaSize = { width: 0, height: 0 }; // Still needed for screen dimensions
        // HitTestResult for MovePoint will be the default for the text box body
        this._hitTest = hitTest || new HitTestResult(HitTestType.MovePoint);
    }
    /**
     * Sets the data payload required to draw and hit-test the text.
     *
     * This method is complex as it includes logic to **invalidate internal caches** (`_linesInfo`, `_boxSize`, etc.)
     * only when the relevant parts of the new data differ from the old data.
     *
     * @param data - The {@link TextRendererData} containing the content and styling.
     * @returns void
     */
    setData(data) {
        // eslint-disable-next-line complexity
        function checkUnchanged(before, after) {
            if (null === before || null === after) {
                return before === after;
            } // If both null, or one null one not
            if (before.points === undefined !== (after.points === undefined)) {
                return false;
            }
            if (before.points !== undefined && after.points !== undefined) {
                if (before.points.length !== after.points.length) {
                    return false;
                }
                for (let i = 0; i < before.points.length; ++i) {
                    if (before.points[i].x !== after.points[i].x || before.points[i].y !== after.points[i].y) {
                        return false;
                    }
                }
            }
            // Perform deep comparison for text options and cursor data
            // This part is crucial for cache invalidation
            return before.text?.forceCalculateMaxLineWidth === after.text?.forceCalculateMaxLineWidth
                && before.text?.forceTextAlign === after.text?.forceTextAlign
                && before.text?.wordWrapWidth === after.text?.wordWrapWidth
                && before.text?.padding === after.text?.padding
                && before.text?.value === after.text?.value
                && before.text?.alignment === after.text?.alignment
                && before.text?.font?.bold === after.text?.font?.bold
                && before.text?.font?.size === after.text?.font?.size
                && before.text?.font?.family === after.text?.font?.family
                && before.text?.font?.italic === after.text?.font?.italic
                && before.text?.box?.angle === after.text?.box?.angle
                && before.text?.box?.scale === after.text?.box?.scale
                && before.text?.box?.offset?.x === after.text?.box?.offset?.x
                && before.text?.box?.offset?.y === after.text?.box?.offset?.y
                && before.text?.box?.maxHeight === after.text?.box?.maxHeight
                && before.text?.box?.padding?.x === after.text?.box?.padding?.x
                && before.text?.box?.padding?.y === after.text?.box?.padding?.y
                && before.text?.box?.alignment?.vertical === after.text?.box?.alignment?.vertical
                && before.text?.box?.alignment?.horizontal === after.text?.box?.alignment?.horizontal
                // Check background inflation (now used)
                && before.text?.box?.background?.inflation?.x === after.text?.box?.background?.inflation?.x
                && before.text?.box?.background?.inflation?.y === after.text?.box?.background?.inflation?.y
                // Check border properties (now including radius and highlight)
                && before.text?.box?.border?.highlight === after.text?.box?.border?.highlight
                && JSON.stringify(before.text?.box?.border?.radius) === JSON.stringify(after.text?.box?.border?.radius) // For array comparison
                // Check new cursor properties
                && before.toolDefaultHoverCursor === after.toolDefaultHoverCursor
                && before.toolDefaultDragCursor === after.toolDefaultDragCursor
                // Check hitTestBackground
                && before.hitTestBackground === after.hitTestBackground;
        }
        if (checkUnchanged(this._data, data)) {
            this._data = data; // If unchanged, just reassign for reference consistency
        }
        else {
            this._data = data; // Assign new data
            // Invalidate all caches
            this._polygonPoints = null;
            this._internalData = null;
            this._linesInfo = null;
            this._fontInfo = null;
            this._boxSize = null;
        }
    }
    /**
     * Performs a hit test on the text box area.
     *
     * The logic first checks if the point falls inside the rotated box polygon and then checks proximity
     * to the box's border segments. A border hit suggests moving the parent tool anchor(s), and an
     * internal hit suggests dragging the entire text box (translation).
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns A {@link HitTestResult} if the text box is hit, otherwise `null`.
     */
    hitTest(x, y) {
        if (this._data === null || this._data.points === undefined || this._data.points.length === 0) {
            return null;
        }
        const hitPoint = new Point(x, y);
        const { text, toolDefaultHoverCursor, toolDefaultDragCursor, hitTestBackground } = this._data;
        // The calculated polygon points (4 corners of the rotated text box)
        const polygonPoints = this._getPolygonPoints();
        // Check if the point is inside the calculated polygon
        const isInsidePolygon = pointInPolygon(hitPoint, polygonPoints);
        // CRUCIAL FIX: Implement Border Hit Test for robustness, especially on zero-area input
        const borderWidth = text.box?.border?.width || 0;
        const borderHitTolerance = 4; // Add a small pixel tolerance for border clicks (e.g. 4px)
        let isNearBorder = false;
        // Check proximity to the four segments of the polygon
        for (let i = 0; i < polygonPoints.length; i++) {
            const p1 = polygonPoints[i];
            const p2 = polygonPoints[(i + 1) % polygonPoints.length];
            // Calculate the distance from the clicked point to the line segment
            const distance = distanceToSegment(p1, p2, hitPoint).distance;
            // If distance is within tolerance, it's a border hit
            if (distance <= borderWidth + borderHitTolerance) {
                isNearBorder = true;
                break;
            }
        }
        // --- Determine Hit Type based on location ---
        // 1. Hit the border (or near it) - This implies moving the line tool itself
        if (isNearBorder) {
            const suggestedCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
            // Use HitTestType.MovePoint for the border or general hover/drag.
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor });
        }
        // 2. Hit inside the polygon (background) - This implies dragging the whole tool
        if (isInsidePolygon && hitTestBackground) {
            const suggestedCursor = toolDefaultDragCursor || PaneCursorType.Grabbing;
            // Use HitTestType.MovePointBackground for drag.
            return new HitTestResult(HitTestType.MovePointBackground, { pointIndex: null, suggestedCursor });
        }
        return null;
    }
    /**
     * Calculates and retrieves the final pixel dimensions of the rendered text box.
     *
     * @returns The {@link BoxSize} (width and height) of the rendered element.
     */
    measure() {
        if (this._data === null) {
            return { width: 0, height: 0 };
        }
        return this._getBoxSize();
    }
    /**
     * Retrieves the bounding rectangle (x, y, width, height) of the text box in screen coordinates.
     *
     * This uses the cached internal data for position and size.
     *
     * @returns An object containing the top-left coordinate, width, and height of the bounding box.
     */
    rect() {
        if (this._data === null) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        const internalData = this._getInternalData();
        return { x: internalData.boxLeft, y: internalData.boxTop, width: internalData.boxWidth, height: internalData.boxHeight };
    }
    /**
     * Determines if the entire text box is positioned off-screen.
     *
     * This check first uses a simple AABB comparison and then, for more robust culling of rotated boxes,
     * checks if all four corners of the rotated polygon are outside the viewport.
     *
     * @param width - The width of the visible pane area.
     * @param height - The height of the visible pane area.
     * @returns `true` if the text box is entirely off-screen, `false` otherwise.
     */
    isOutOfScreen(width, height) {
        if (null === this._data || void 0 === this._data.points || 0 === this._data.points.length) {
            return true;
        }
        const internalData = this._getInternalData();
        if (internalData.boxLeft + internalData.boxWidth < 0 || internalData.boxLeft > width) {
            const screenBox = new Box(new Point(0, 0), new Point(width, height));
            return this._getPolygonPoints().every((point) => !pointInBox(point, screenBox));
        }
        return false;
    }
    /**
     * Retrieves the cached CSS font string used for rendering and measurement (e.g., 'bold 12px sans-serif').
     *
     * @returns The computed font style string.
     */
    fontStyle() {
        return this._data === null ? '' : this._getFontInfo().fontStyle;
    }
    /**
     * Executes the word-wrapping logic for a given string, font, and maximum line width.
     *
     * This is primarily a proxy for the external `textWrap` utility function.
     *
     * @param test - The raw string content to wrap.
     * @param wrapWidth - The maximum pixel width for a single line before wrapping.
     * @param font - Optional font string to use for measurement.
     * @returns An array of strings representing the final, wrapped lines.
     */
    wordWrap(test, wrapWidth, font) {
        // Calls the external textWrap helper function
        return textWrap(test, font || this.fontStyle(), wrapWidth);
    }
    /**
     * Draws the complete text box element onto the chart pane.
     *
     * This method:
     * 1. Saves the canvas context and applies rotation/translation transforms based on the box's configuration.
     * 2. Draws the shadow, background fill, and border.
     * 3. Draws each of the wrapped text lines.
     * 4. Restores the canvas context.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (this._data === null || this._data.points === undefined || this._data.points.length === 0) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            this._mediaSize = mediaSize;
            const cssWidth = mediaSize.width;
            const cssHeight = mediaSize.height;
            if (this.isOutOfScreen(cssWidth, cssHeight)) {
                return;
            }
            const data = ensureNotNull(this._data); // Ensure _data is not null
            const textData = ensureNotNull(data.text);
            const internalData = this._getInternalData();
            const pivot = internalData.rotationPivot; // Use the stored rotationPivot
            const angleDegrees = textData.box?.angle || 0;
            const angle = -angleDegrees * Math.PI / 180; // Convert to radians, negative for clockwise rotation
            ctx.save(); // Save context before rotation/translation
            ctx.translate(pivot.x, pivot.y);
            ctx.rotate(angle);
            ctx.translate(-pivot.x, -pivot.y);
            // These variables are now ready for use, directly reflecting internalData.boxLeft/Top
            const scaledBoxLeft = internalData.boxLeft;
            const scaledBoxTop = internalData.boxTop;
            const scaledBoxWidth = internalData.boxWidth;
            const scaledBoxHeight = internalData.boxHeight;
            const borderRadius = textData.box?.border?.radius || 0; // Ensure radius is passed
            const boxBorderStyle = textData.box?.border?.style || LineStyle.Solid;
            // --- Shadow, Background, and Border Drawing ---
            // Draw order: Shadow (cast by fill) -> Fill -> Border -> Text
            // 1. Apply shadow properties if they exist and blur/color is set
            let shadowApplied = false;
            if (textData.box?.shadow) {
                const shadow = textData.box.shadow;
                if (shadow.blur > 0 || !isFullyTransparent(shadow.color)) {
                    ctx.shadowColor = shadow.color;
                    ctx.shadowBlur = shadow.blur;
                    ctx.shadowOffsetX = shadow.offset.x;
                    ctx.shadowOffsetY = shadow.offset.y;
                    shadowApplied = true;
                }
            }
            // 2. Draw box background (this will cast the shadow)
            if (textData.box?.background?.color && !isFullyTransparent(textData.box.background.color)) {
                ctx.fillStyle = textData.box.background.color;
                drawRoundRect(ctx, scaledBoxLeft, scaledBoxTop, scaledBoxWidth, scaledBoxHeight, borderRadius, boxBorderStyle);
                ctx.fill();
            }
            // 3. Reset shadow properties BEFORE drawing the border, so the border itself doesn't cast a shadow
            // and so the shadow only appears from the filled background.
            if (shadowApplied) { // Only reset if shadow was applied
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
            // 4. Draw border
            if ((textData.box?.border?.width || 0) > 0 && textData.box?.border?.color && !isFullyTransparent(textData.box.border.color)) {
                ctx.strokeStyle = textData.box.border.color;
                ctx.lineWidth = textData.box.border.width;
                drawRoundRect(ctx, scaledBoxLeft, scaledBoxTop, scaledBoxWidth, scaledBoxHeight, borderRadius, boxBorderStyle);
                ctx.stroke();
            }
            // Draw text
            ctx.fillStyle = textData.font?.color;
            ctx.font = this._getFontInfo().fontStyle; // Use cached font string
            // FIX: Robustly map the stored string enum value to the correct Canvas literal string.
            // This addresses the issue of the tertiary operator failing to correctly resolve the center case.
            const alignValue = internalData.textAlign;
            let canvasAlign;
            if (alignValue === TextAlignment.Center) {
                canvasAlign = 'center';
            }
            else if (alignValue === TextAlignment.End || alignValue === TextAlignment.Right) {
                canvasAlign = 'right';
            }
            else { // Catches TextAlignment.Start, TextAlignment.Left, and any ambiguous default
                canvasAlign = 'left';
            }
            ctx.textAlign = canvasAlign; // Apply the explicit alignment
            ctx.textBaseline = 'middle';
            const { lines } = this._getLinesInfo();
            const linePadding = getScaledPadding(data);
            const scaledFontSize = getScaledFontSize(data);
            const extraSpace = 0.05 * scaledFontSize;
            // Apply extraSpace to the initial Y position
            let currentTextY = internalData.boxTop + internalData.textTop + extraSpace; // Start Y for first line
            for (const line of lines) {
                const textX = internalData.boxLeft + internalData.textStart; // Text X is always based on box position
                // Draw text with scaling to handle non-integer pixel ratios
                ctx.fillText(line, textX, currentTextY); // No need for drawScaled in V5 media space
                currentTextY += scaledFontSize + linePadding;
            }
            ctx.restore(); // Restore context to remove rotation/translation
        });
    }
    // #region Private/Protected Helper Methods (from V3.8)
    /**
     * Calculates and caches the master internal state (`InternalData`) for positioning and drawing.
     *
     * This is a heavy calculation that:
     * 1. Determines the final position (`boxLeft`, `boxTop`) based on the tool's anchor points and text box alignment/offset.
     * 2. Determines the text alignment and start position within the box.
     * 3. Calculates the `rotationPivot`.
     *
     * @returns The cached {@link InternalData} object.
     * @private
     */
    _getInternalData() {
        if (this._internalData !== null) {
            return this._internalData;
        }
        const data = ensureNotNull(this._data);
        const paddingX = getScaledBoxPaddingX(data);
        const paddingY = getScaledBoxPaddingY(data);
        const inflationPaddingX = getScaledBackgroundInflationX(data) + paddingX;
        const inflationPaddingY = getScaledBackgroundInflationY(data) + paddingY;
        //Check if two points are present but identical.
        const isDegenerate = data.points && data.points.length >= 2 && equalPoints(data.points[0], data.points[1]);
        // Ensure we have at least one point, which is now expected to be the rectangle's top-left in the pane view context
        // However, for the new logic, we expect two points (rectangle's corners) to calculate parent bounds.
        //console.log('data.points', data.points)
        if (!data.points || data.points.length < 2 || isDegenerate) {
            // Fallback: Treat the first point as the anchor/reference for positioning.
            //console.warn('[TextRenderer] _getInternalData called with less than 2 points or degenerate. Using anchor-based alignment.');
            const boxSize = this._getBoxSize();
            const boxWidth = boxSize.width;
            const boxHeight = boxSize.height;
            const defaultAnchor = data.points && data.points.length > 0 ? data.points[0] : new Point(0, 0);
            // Recompute paddings (safe to re-call; mirrors main path)
            const paddingX = getScaledBoxPaddingX(data);
            const paddingY = getScaledBoxPaddingY(data);
            const inflationPaddingX = getScaledBackgroundInflationX(data) + paddingX;
            const inflationPaddingY = getScaledBackgroundInflationY(data) + paddingY;
            // --- Mirror Step 1: refX/Y from "degenerate rectangle" (single point as min=max) ---
            // For degenerate, rect bounds = defaultAnchor (no min/max calc needed)
            let refX = defaultAnchor.x;
            let refY = defaultAnchor.y;
            // But for HorizontalLine context, refX is already the desired pivot (0/center/paneWidth from pane view),
            // so no switch needed here—refX is the "attachment point".
            // --- Mirror Step 2: Offset boxLeft/Top from refX/Y based on box.alignment ---
            let textBoxFinalX = refX;
            let textBoxFinalY = refY;
            // Horizontal: Position box left edge relative to refX
            switch ((data.text?.box?.alignment?.horizontal || '').toLowerCase()) {
                case 'left':
                    textBoxFinalX = refX; // Left edge at refX, expands right
                    break;
                case 'center':
                    textBoxFinalX = refX - boxWidth / 2; // Center at refX
                    break;
                case 'right':
                    textBoxFinalX = refX - boxWidth; // Right edge at refX, expands left
                    break;
            }
            // Vertical: Position box top edge relative to refY (unchanged from original)
            switch ((data.text?.box?.alignment?.vertical || '').toLowerCase()) {
                case 'top':
                    textBoxFinalY = refY - boxHeight; // Top at refY? Wait, original: Bottom at refY, expands up? No:
                    // Per original: For Top: textBoxFinalY = refY - boxHeight (bottom at refY? Wait, clarify:
                    // Original Vertical Top: "Bottom edge of text box aligns with refY. It expands up." → textBoxFinalY = refY - boxHeight
                    // (Assuming Y increases down; box top at Y - height, bottom at Y)
                    break;
                case 'middle':
                    textBoxFinalY = refY - boxHeight / 2;
                    break;
                case 'bottom':
                    textBoxFinalY = refY;
                    break;
            }
            // --- Mirror Step 3: Apply offset ---
            textBoxFinalX += (data.text?.box?.offset?.x || 0);
            textBoxFinalY += (data.text?.box?.offset?.y || 0);
            // --- Mirror Step 4: Internal text alignment/textStart (your existing switch) ---
            const rawAlignment = (ensureDefined(data.text?.alignment) || 'start').toLowerCase().trim();
            let textStart = inflationPaddingX; // Safe init
            let textAlign = TextAlignment.Start;
            switch (rawAlignment) {
                case TextAlignment.Start:
                case TextAlignment.Left: {
                    // FIX: Always assign TextAlignment.Start to maintain clean enum value.
                    textAlign = TextAlignment.Start;
                    textStart = inflationPaddingX;
                    if (isRtl()) {
                        if (data.text?.forceTextAlign) {
                            // FIX: Ensure clean enum. Since it's forcing LTR start in RTL, use Start.
                            textAlign = TextAlignment.Start;
                        }
                        else {
                            textStart = boxWidth - inflationPaddingX;
                            // FIX: Use clean enum for RTL end.
                            textAlign = TextAlignment.End;
                        }
                    }
                    break;
                }
                case TextAlignment.Center: {
                    // FIX: Always assign TextAlignment.Center.
                    textAlign = TextAlignment.Center;
                    textStart = boxWidth / 2;
                    break;
                }
                case TextAlignment.End:
                case TextAlignment.Right: {
                    // FIX: Always assign TextAlignment.End.
                    textAlign = TextAlignment.End;
                    textStart = boxWidth - inflationPaddingX;
                    if (isRtl() && data.text?.forceTextAlign) {
                        // FIX: Ensure clean enum. Since it's forcing LTR end in RTL, use End.
                        textAlign = TextAlignment.End;
                    }
                    break;
                }
                default: {
                    console.warn(`[TextRenderer] Unknown text alignment "${data.text?.alignment}" in fallback; defaulting to Start.`);
                    textStart = inflationPaddingX;
                    // FIX: Explicitly set default to clean enum.
                    textAlign = TextAlignment.Start;
                }
            }
            // Text Y (unchanged)
            const textTop = inflationPaddingY + getScaledFontSize(data) / 2;
            // --- Rotation Pivot: Use ref point (anchor) ---
            const rotationPivot = defaultAnchor;
            this._internalData = {
                boxLeft: textBoxFinalX,
                boxTop: textBoxFinalY,
                boxWidth: boxWidth,
                boxHeight: boxHeight,
                textAlign: textAlign,
                textTop: textTop,
                textStart: textStart,
                rotationPivot: rotationPivot,
            };
            return this._internalData;
        }
        const [rectPointA, rectPointB] = data.points; // These are the two defining points of the parent rectangle
        // Calculate the actual bounding box of the parent rectangle
        const rectMinX = Math.min(rectPointA.x, rectPointB.x);
        const rectMaxX = Math.max(rectPointA.x, rectPointB.x);
        const rectMinY = Math.min(rectPointA.y, rectPointB.y);
        const rectMaxY = Math.max(rectPointA.y, rectPointB.y);
        const boxSize = this._getBoxSize();
        const boxWidth = boxSize.width;
        const boxHeight = boxSize.height;
        let refX = 0; // Reference point on the parent rectangle for the text box
        let refY = 0;
        // --- Step 1: Determine the Reference Point on the Parent Rectangle ---
        switch ((data.text?.box?.alignment?.horizontal || '').toLowerCase()) {
            case BoxHorizontalAlignment.Left:
                refX = rectMinX;
                break;
            case BoxHorizontalAlignment.Center:
                refX = (rectMinX + rectMaxX) / 2;
                break;
            case BoxHorizontalAlignment.Right:
                refX = rectMaxX;
                break;
        }
        switch ((data.text?.box?.alignment?.vertical || '').toLowerCase()) {
            case BoxVerticalAlignment.Top:
                refY = rectMinY;
                break;
            case BoxVerticalAlignment.Middle:
                refY = (rectMinY + rectMaxY) / 2;
                break;
            case BoxVerticalAlignment.Bottom:
                refY = rectMaxY;
                break;
        }
        // --- Store this calculated reference point as the rotation pivot immediately ---
        const rotationPivot = new Point(refX, refY);
        let textBoxFinalX = refX;
        let textBoxFinalY = refY;
        // --- Step 2: Position the Text Box's Top-Left based on its own size and alignment to the Reference Point ---
        switch ((data.text?.box?.alignment?.horizontal || '').toLowerCase()) {
            case BoxHorizontalAlignment.Left:
                // Left edge of text box aligns with refX. It expands right.
                textBoxFinalX = refX;
                break;
            case BoxHorizontalAlignment.Center:
                // Center of text box aligns with refX.
                textBoxFinalX = refX - boxWidth / 2;
                break;
            case BoxHorizontalAlignment.Right:
                // Right edge of text box aligns with refX. It expands left.
                textBoxFinalX = refX - boxWidth;
                break;
        }
        switch ((data.text?.box?.alignment?.vertical || '').toLowerCase()) {
            case BoxVerticalAlignment.Top:
                // Bottom edge of text box aligns with refY. It expands up.
                textBoxFinalY = refY - boxHeight;
                break;
            case BoxVerticalAlignment.Middle:
                // Middle of text box aligns with refY.
                textBoxFinalY = refY - boxHeight / 2;
                break;
            case BoxVerticalAlignment.Bottom:
                // Top edge of text box aligns with refY. It expands down.
                textBoxFinalY = refY;
                break;
        }
        // --- Step 3: Apply `text.box.offset` as a final adjustment ---
        textBoxFinalX += (data.text?.box?.offset?.x || 0);
        textBoxFinalY += (data.text?.box?.offset?.y || 0);
        //let textX = 0; // X position for text rendering relative to textbox left
        //let textAlign = TextAlignment.Start;
        // --- Step 4: Determine internal text alignment within the textbox ---
        const rawAlignment = (ensureDefined(data.text?.alignment) || 'start').toLowerCase().trim(); // Normalize + fallback to 'start' + trim whitespace
        let textX = inflationPaddingX; // Safe init: padded left (better than 0)
        let textAlign = TextAlignment.Start;
        switch (rawAlignment) {
            case 'start':
            case 'left': {
                textAlign = TextAlignment.Start;
                textX = inflationPaddingX;
                if (isRtl()) {
                    if (data.text?.forceTextAlign) {
                        textAlign = TextAlignment.Start;
                    }
                    else {
                        textX = boxWidth - inflationPaddingX;
                        textAlign = TextAlignment.End;
                    }
                }
                break;
            }
            case 'center': {
                textAlign = TextAlignment.Center;
                textX = boxWidth / 2;
                break;
            }
            case 'end':
            case 'right': {
                textAlign = TextAlignment.End;
                textX = boxWidth - inflationPaddingX;
                if (isRtl() && data.text?.forceTextAlign) {
                    textAlign = TextAlignment.End;
                }
                break;
            }
            default: {
                // Fallback + log for debugging
                console.warn(`[TextRenderer] Unknown text alignment "${data.text?.alignment}"; defaulting to Start (padded left).`);
                textX = inflationPaddingX;
                // Optionally force center for unknown: textAlign = TextAlignment.Center; textX = boxWidth / 2;
            }
        }
        // Calculate text start Y relative to box top. textBaseline is 'middle'
        const textY = inflationPaddingY + getScaledFontSize(data) / 2;
        this._internalData = {
            boxLeft: textBoxFinalX,
            boxTop: textBoxFinalY,
            boxWidth: boxWidth,
            boxHeight: boxHeight,
            textAlign: textAlign,
            textTop: textY, // Offset from box top to text middle
            textStart: textX, // Offset from box left to text start
            rotationPivot: rotationPivot,
        };
        return this._internalData;
    }
    /**
     * Calculates the maximum pixel width among all wrapped lines of text.
     *
     * If word wrap is configured, this uses the fixed `wordWrapWidth` instead of measuring.
     *
     * @param lines - The array of wrapped text strings.
     * @returns The maximum width in pixels.
     * @private
     */
    _getLinesMaxWidth(lines) {
        const data = ensureNotNull(this._data); // Ensure data is not null for helper functions
        // Use text-helpers' createCacheCanvas and cacheCanvas
        createCacheCanvas();
        const ctx = ensureNotNull(cacheCanvas);
        ctx.font = this.fontStyle(); // Set font for accurate measurement
        if (data.text?.wordWrapWidth && !data.text?.forceCalculateMaxLineWidth) {
            return data.text.wordWrapWidth * getFontAwareScale(data);
        }
        let maxWidth = 0;
        for (const line of lines) {
            maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
        }
        return maxWidth;
    }
    /**
     * Calculates and caches the {@link LinesInfo} structure.
     *
     * This performs the word wrapping, checks for max height constraints (truncating lines if necessary),
     * and calculates the max line width.
     *
     * @returns The cached {@link LinesInfo} object.
     * @private
     */
    _getLinesInfo() {
        if (null === this._linesInfo) {
            const data = ensureNotNull(this._data);
            let lines = textWrap(ensureDefined(data.text?.value), this.fontStyle(), data.text?.wordWrapWidth);
            if (data.text?.box?.maxHeight !== undefined && data.text.box.maxHeight > 0) {
                const maxHeight = ensureDefined(data.text?.box?.maxHeight);
                const scaledFontSize = getScaledFontSize(data);
                const scaledPadding = getScaledPadding(data);
                // MODIFIED: Use V3.8's maxHeight calculation for maxLines
                // V3.8: maxLines = Math.floor((maxHeight + scaledPadding) / (scaledFontSize + scaledPadding));
                // This interprets maxHeight as the space *for the content*, and scaledPadding accounts for the space *between* lines.
                // If scaledPadding is 0, this simplifies to maxHeight / scaledFontSize.
                const lineHeightWithSpacing = scaledFontSize + scaledPadding;
                let maxLines;
                if (lineHeightWithSpacing > 0) { // Avoid division by zero
                    maxLines = Math.floor((maxHeight + scaledPadding) / lineHeightWithSpacing);
                }
                else {
                    maxLines = Infinity; // If no height/spacing per line, assume unlimited lines
                }
                if (lines.length > maxLines) {
                    lines = lines.slice(0, maxLines); // Truncate lines
                }
            }
            this._linesInfo = { linesMaxWidth: this._getLinesMaxWidth(lines), lines };
        }
        return this._linesInfo;
    }
    /**
     * Calculates and caches the {@link FontInfo} structure, including the final CSS font string and pixel size.
     *
     * This is used once to configure the drawing context and repeatedly for text width measurement.
     *
     * @returns The cached {@link FontInfo} object.
     * @private
     */
    _getFontInfo() {
        if (this._fontInfo === null) {
            const data = ensureNotNull(this._data);
            const fontSize = getScaledFontSize(data);
            const fontStyle = (data.text?.font?.bold ? 'bold ' : '') + (data.text?.font?.italic ? 'italic ' : '') + fontSize + 'px ' + ensureDefined(data.text?.font?.family);
            this._fontInfo = { fontStyle: fontStyle, fontSize: fontSize };
        }
        return this._fontInfo;
    }
    /**
     * Calculates and caches the total pixel dimensions of the text box.
     *
     * This uses the results of `_getLinesInfo` and the configured padding/inflation options.
     *
     * @returns The cached {@link BoxSize} object.
     * @private
     */
    _getBoxSize() {
        if (null === this._boxSize) {
            const linesInfo = this._getLinesInfo();
            const data = ensureNotNull(this._data);
            this._boxSize = {
                width: getBoxWidth(data, linesInfo.linesMaxWidth),
                height: getBoxHeight(data, linesInfo.lines.length),
            };
        }
        return this._boxSize;
    }
    /**
     * Calculates and caches the four corner points of the rotated text box bounding polygon in screen coordinates.
     *
     * This polygon is the basis for accurate hit testing on the rotated element.
     *
     * @returns An array of four {@link Point} objects defining the rotated bounding box.
     * @private
     */
    _getPolygonPoints() {
        if (null !== this._polygonPoints) {
            return this._polygonPoints;
        }
        if (null === this._data) {
            return [];
        }
        const { boxLeft, boxTop, boxWidth, boxHeight } = this._getInternalData();
        const pivot = this._getRotationPoint();
        const angleDegrees = this._data.text?.box?.angle || 0;
        const angle = -angleDegrees * Math.PI / 180; // Convert to radians, negative for clockwise rotation
        this._polygonPoints = [
            rotatePoint(new Point(boxLeft, boxTop), pivot, angle),
            rotatePoint(new Point((boxLeft + boxWidth), boxTop), pivot, angle),
            rotatePoint(new Point((boxLeft + boxWidth), (boxTop + boxHeight)), pivot, angle),
            rotatePoint(new Point(boxLeft, (boxTop + boxHeight)), pivot, angle),
        ];
        return this._polygonPoints;
    }
    /**
     * Retrieves the pivot point in screen coordinates around which the text box is rotated.
     *
     * This point is calculated and stored in the internal data cache by `_getInternalData`.
     *
     * @returns A {@link Point} object representing the rotation pivot.
     * @private
     */
    _getRotationPoint() {
        // After changes in _getInternalData, the 'rotationPivot' already holds the correct
        // conceptual anchor point (e.g., line midpoint, or rectangle center).
        // This method now simply retrieves and returns that stored pivot.
        const internalData = this._getInternalData();
        return internalData.rotationPivot;
    }
}
/**
 * Renders an arbitrary circle defined by two points.
 *
 * This supports hit testing on both the circle's perimeter (border) and its interior (background fill).
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class CircleRenderer {
    /**
     * Initializes the Circle Renderer.
     *
     * @param hitTest - An optional, pre-configured {@link HitTestResult} template.
     */
    constructor(hitTest) {
        this._data = null;
        this._mediaSize = { width: 0, height: 0 };
        this._hitTest = hitTest || new HitTestResult(HitTestType.MovePoint);
        // console.log("CircleRenderer constructor called");
    }
    /**
     * Sets the data payload required to draw and hit-test the circle.
     *
     * @param data - The {@link CircleRendererData} containing the points and styling options.
     * @returns void
     */
    setData(data) {
        this._data = data;
        // console.log("CircleRenderer setData", data);
    }
    /**
     * Draws the circle onto the chart pane, handling both the background fill and the border stroke.
     *
     * The radius is dynamically calculated as the distance between the two input points.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (!this._data || !this._data.points || this._data.points.length < 2) {
            return;
        }
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            this._mediaSize = mediaSize; // Store mediaSize for hitTest
            const { background, border, points } = this._data;
            const [point0, point1] = points;
            const centerX = point0.x;
            const centerY = point0.y;
            const radius = point0.subtract(point1).length(); // Distance from center to circumference point
            if (radius <= 0) { // Don't draw if radius is zero or negative
                return;
            }
            // Background fill
            if (background?.color) {
                ctx.fillStyle = background.color;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
            // Border stroke
            if (border?.width && border.width > 0 && border.color) {
                ctx.strokeStyle = border.color;
                ctx.lineWidth = border.width; // Ensure LineWidth is number
                setLineStyle(ctx, border.style || LineStyle.Solid); // Apply line style
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            }
        });
    }
    /**
     * Performs a hit test on the circle's perimeter and its optional background fill area.
     *
     * Perimeter hit testing uses a tolerance around the calculated radius.
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns A {@link HitTestResult} if the circle is hit, otherwise `null`.
     */
    hitTest(x, y) {
        if (!this._data || !this._data.points || this._data.points.length < 2 || !this._mediaSize.width || !this._mediaSize.height) {
            return null;
        }
        const { points, hitTestBackground, toolDefaultHoverCursor, toolDefaultDragCursor } = this._data;
        const [point0, point1] = points;
        const clickedPoint = new Point(x, y);
        const centerX = point0.x;
        const centerY = point0.y;
        const radius = point0.subtract(point1).length();
        if (radius <= 0) {
            return null;
        }
        const distanceToCenter = new Point(centerX, centerY).subtract(clickedPoint).length();
        this._data.border?.width || 0;
        const hitTestTolerance = interactionTolerance.line; // Use general line tolerance
        // Check if point is near the circle's outline (border)
        if (Math.abs(distanceToCenter - radius) <= hitTestTolerance) {
            // NEW: Return LineToolHitTestData with suggestedCursor
            const suggestedCursor = toolDefaultHoverCursor || PaneCursorType.Pointer;
            return new HitTestResult(HitTestType.MovePoint, { pointIndex: null, suggestedCursor });
        }
        // Check if point is inside the circle (for background hit)
        if (hitTestBackground && distanceToCenter < radius) {
            // NEW: Return LineToolHitTestData with suggestedCursor
            const suggestedCursor = toolDefaultDragCursor || PaneCursorType.Grabbing;
            return new HitTestResult(HitTestType.MovePointBackground, { pointIndex: null, suggestedCursor });
        }
        return null;
    }
}
// #endregion

// /src/rendering/composite-renderer.ts
/**
 * A composite renderer that combines multiple {@link IPaneRenderer} instances into a single object.
 *
 * It is responsible for orchestrating the drawing of its contained renderers in sequence
 * and performing hit tests on all of them in reverse order (top-most first) to simulate Z-order.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class CompositeRenderer {
    constructor() {
        this._renderers = [];
    }
    /**
     * Appends a renderer to the composite.
     *
     * Renderers are drawn in the order they are appended, from first to last.
     *
     * @param renderer - The {@link IPaneRenderer} to add.
     * @returns void
     */
    append(renderer) {
        this._renderers.push(renderer);
    }
    /**
     * Clears all contained renderers from the composite.
     *
     * This is typically used by views when updating, to rebuild the set of renderers
     * needed for the current tool state.
     *
     * @returns void
     */
    clear() {
        this._renderers.length = 0;
    }
    /**
     * Checks if the composite contains any renderers.
     * @returns `true` if no renderers are present, `false` otherwise.
     */
    isEmpty() {
        return this._renderers.length === 0;
    }
    /**
     * Draws all contained renderers in sequence using the provided rendering target.
     *
     * @param target - The {@link CanvasRenderingTarget2D} provided by Lightweight Charts.
     * @returns void
     */
    draw(target) {
        if (this.isEmpty()) {
            return;
        }
        this._renderers.forEach((renderer) => {
            renderer.draw(target);
        });
    }
    /**
     * Performs a hit test by querying all contained renderers in reverse order (topmost first).
     *
     * This simulates the Z-order stack. If multiple renderers are hit, the result from the
     * one closest to the top of the stack will be returned.
     *
     * @param x - The X coordinate for the hit test.
     * @param y - The Y coordinate for the hit test.
     * @returns The {@link HitTestResult} of the topmost hit renderer, or `null` if nothing is hit.
     */
    hitTest(x, y) {
        //console.log(`[CompositeRenderer] hitTest called at X:${x}, Y:${y}`);
        // Iterate in reverse order to simulate Z-order hit testing (topmost element first)
        for (let i = this._renderers.length - 1; i >= 0; i--) {
            const renderer = this._renderers[i];
            //console.log(`[CompositeRenderer]   Testing renderer: ${renderer.constructor.name}`);
            if (renderer.hitTest) { // Check if the renderer implements hitTest
                const hitResult = renderer.hitTest(x, y);
                if (hitResult !== null) {
                    //console.log(`[CompositeRenderer] --- HIT FOUND by ${renderer.constructor.name}! Cursor: ${hitResult.data()?.suggestedCursor || 'undefined'}`);
                    // We found a hit, return it immediately
                    return hitResult;
                }
            }
        }
        //console.log(`[CompositeRenderer] No renderer hit. Returning null.`);
        return null; // No hit found
    }
}

// /src/views/line-tool-pane-view.ts
/**
 * Abstract base class for the Pane View of a Line Tool.
 *
 * This view is responsible for rendering the main visual elements of the tool (lines, shapes, text)
 * directly onto the chart pane. It also manages the state and rendering of interactive elements
 * like resize anchors.
 *
 * Concrete tool implementations should extend this class and override `_updateImpl` to define
 * their specific rendering logic.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item.
 */
class LineToolPaneView {
    /**
     * Initializes the Pane View.
     *
     * @param tool - The specific line tool model.
     * @param chart - The chart API instance.
     * @param series - The series API instance.
     */
    constructor(tool, chart, series) {
        /**
         * Internal cache of the tool's points converted to screen coordinates (pixels).
         * These are recalculated whenever `_updatePoints` is called.
         * @protected
         */
        this._points = []; // Screen coordinates of the tool's defining points
        /**
         * Dirty flag indicating if the view's data is out of sync with the model.
         * If `true`, `_updateImpl` will be called during the next render cycle.
         * @protected
         */
        this._invalidated = true; // Flag to indicate if the view needs updating
        /**
         * Collection of renderers responsible for drawing the interactive anchor points (handles).
         * These are reused to avoid unnecessary object creation.
         * @protected
         */
        this._lineAnchorRenderers = []; // Renderers for the tool's anchor points
        this._tool = tool;
        this._chart = chart;
        this._series = series;
        // Initialize the renderer here, it will be populated in _updateImpl
        // Default to a composite renderer which can hold other renderers
        this._renderer = new CompositeRenderer();
        this._rectangleRenderer = new RectangleRenderer();
        this._labelRenderer = new TextRenderer();
    }
    /**
     * Signals that the view's data or options have changed.
     *
     * Sets the `_invalidated` flag to `true`, forcing a recalculation of geometry
     * and render data during the next paint cycle.
     *
     * @param updateType - The type of update (e.g., 'data', 'options').
     */
    update(updateType) {
        this._invalidated = true;
    }
    /**
     * Retrieves the renderer for the current frame.
     *
     * If the view is invalidated, this method triggers `_updateImpl` to refresh the
     * rendering logic before returning the renderer.
     *
     * @returns The {@link IPaneRenderer} to be drawn, or `null` if nothing should be rendered.
     */
    renderer() {
        if (this._invalidated) {
            const chartElement = this._chart.chartElement();
            const height = chartElement.clientHeight;
            const width = chartElement.clientWidth;
            // If the chart has no size, there is nothing to draw.
            if (height <= 0 || width <= 0) {
                this._renderer.clear();
                return null;
            }
            this._updateImpl(height, width);
            this._invalidated = false;
        }
        return this._renderer;
    }
    /**
     * Converts the tool's logical points (Time/Price) into screen coordinates (Pixels).
     *
     * This method accesses the chart's time scale and the series' price scale to perform
     * the conversion. It populates the `_points` array.
     *
     * @returns `true` if all points were successfully converted, `false` if scale data is missing.
     * @protected
     */
    _updatePoints() {
        const timeScaleApi = this._chart.timeScale();
        const priceScale = this._tool.priceScale();
        if (timeScaleApi.getVisibleLogicalRange() === null || !priceScale) {
            return false;
        }
        this._points = [];
        const sourcePoints = this._tool.points();
        for (let i = 0; i < sourcePoints.length; i++) {
            const point = this._tool.pointToScreenPoint(sourcePoints[i]);
            if (!point) {
                return false; // Point conversion failed
            }
            point.data = i;
            this._points.push(point);
        }
        return true;
    }
    /**
     * The core update logic for the view.
     *
     * This method is called when the view is invalidated. It is responsible for:
     * 1. Clearing the composite renderer.
     * 2. Updating point coordinates via `_updatePoints`.
     * 3. Constructing the specific renderers (lines, shapes) required for the tool's current state.
     * 4. Adding interaction anchors if applicable.
     *
     * @param height - The current height of the pane in pixels.
     * @param width - The current width of the pane in pixels.
     * @protected
     */
    _updateImpl(height, width) {
        this._renderer.clear();
        if (!this._tool.options().visible) {
            return;
        }
        if (this._updatePoints()) {
            // This is where a generic tool might add its renderers.
            // For our specific tools, we'll override this entire method.
            if (this.areAnchorsVisible() && this._points.length > 0) {
                this._addAnchors(this._renderer);
            }
        }
    }
    /**
     * Determines if the tool's interaction anchors (resize handles) should be visible.
     *
     * Anchors are typically shown when the tool is selected, hovered, being edited,
     * or currently being drawn (not finished).
     *
     * @returns `true` if anchors should be drawn.
     * @protected
     */
    areAnchorsVisible() {
        return this._tool.isHovered() || this._tool.isSelected() || this._tool.isEditing() || !this._tool.isFinished();
    }
    /**
     * Adds anchor renderers to the composite renderer.
     *
     * This method is intended to be overridden or used by subclasses to place
     * resize handles at specific points (e.g., corners of a rectangle, ends of a line).
     *
     * @param renderer - The composite renderer to append anchors to.
     * @protected
     */
    _addAnchors(renderer) {
        // Concrete views will pass their specific anchor configurations to this.createLineAnchor.
        // This abstract method is just a placeholder to ensure it's called.
    }
    /**
     * Factory method to create or recycle a `LineAnchorRenderer`.
     *
     * It configures the anchor with standard styling (colors, hit test logic) and
     * specific interaction data (index, cursor type).
     *
     * @param data - Configuration data for the anchor (points, cursors).
     * @param index - The index in the internal renderer array (for recycling).
     * @returns A configured {@link LineAnchorRenderer}.
     * @protected
     */
    createLineAnchor(data, index) {
        let renderer = this._lineAnchorRenderers[index];
        if (!renderer) {
            renderer = new LineAnchorRenderer(this._chart); // Pass chart instance to anchor renderer
            this._lineAnchorRenderers.push(renderer);
        }
        // Populate the renderer with common anchor data
        this._tool.options();
        renderer.setData({
            ...data,
            radius: 6, // Default radius
            strokeWidth: 1, // Default stroke width
            color: '#1E53E5', // Default color (blue)
            hoveredStrokeWidth: 4, // Default hovered stroke width
            selected: this._tool.isSelected(),
            visible: this.areAnchorsVisible(),
            currentPoint: this._tool.currentPoint(), // Mouse position
            backgroundColors: this._lineAnchorColors(data.points), // Colors for anchors' backgrounds
            editedPointIndex: this._tool.isEditing() ? this._tool.editedPointIndex() : null,
            hitTestType: HitTestType.ChangePoint, // Default hit test type for anchors
        });
        return renderer;
    }
    /**
     * Helper to determine the background color for anchor points.
     *
     * By default, it attempts to match the chart's background color to make hollow
     * anchors look transparent or blend in. Subclasses can override this for custom styling.
     *
     * @param points - The list of anchor points.
     * @returns An array of color strings corresponding to each point.
     * @protected
     */
    _lineAnchorColors(points) {
        // This is a placeholder; concrete views can override for custom coloring.
        // Defaulting to chart's layout background color for anchor circles/squares.
        const chartOptions = this._chart.options();
        const backgroundColor = chartOptions.layout.background;
        // Apply a color based on the chart's background type
        const defaultAnchorColor = backgroundColor.type === 'solid' ? backgroundColor.color : 'transparent';
        return points.map(point => defaultAnchorColor);
    }
}

// /src/index.ts
/**
 * The main factory function to create and initialize the Line Tools Core Plugin.
 *
 * This function validates the provided chart and series, initializes the core logic,
 * and returns the API interface needed to interact with the plugin.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale (e.g., `Time`, `UTCTimestamp`, or `number`).
 * @param chart - The Lightweight Charts chart instance (must be created via `createChart`).
 * @param series - The specific series instance to which the drawing tools will be attached.
 * @returns An {@link ILineToolsPlugin} instance providing the API for tool management.
 *
 * @remarks
 * If the chart or series is invalid, this function will log an error and return a "dummy"
 * no-op API to prevent your application from crashing.
 *
 * @example
 * ```ts
 * const chart = createChart(document.body, { ... });
 * const series = chart.addCandlestickSeries();
 *
 * const lineTools = createLineToolsPlugin(chart, series);
 * ```
 */
function createLineToolsPlugin(chart, series) {
    try {
        if (!chart || typeof chart.timeScale !== 'function') {
            throw new Error('A valid Lightweight Charts chart instance must be provided.');
        }
        if (!series || typeof series.priceScale !== 'function') {
            throw new Error('A valid Lightweight Charts series instance must be provided.');
        }
        console.log('Initializing Line Tools Core Plugin...');
        const horzScaleBehavior = chart.horzBehaviour();
        const plugin = new LineToolsCorePlugin(chart, series, horzScaleBehavior);
        // The plugin instance itself serves as the enhanced API object.
        return plugin;
    }
    catch (error) {
        console.error('Failed to initialize Line Tools Core Plugin:', error.message);
        // Return a dummy object to prevent the consuming application from crashing if initialization fails.
        // The real solution would be for the user to fix their setup, but this provides a fallback.
        return createDummyPluginApi();
    }
}
/**
 * Creates a no-op (dummy) implementation of the plugin API.
 *
 * This is used internally as a fallback when the plugin fails to initialize (e.g., due to missing
 * chart or series arguments). It ensures that subsequent calls to the plugin API do not throw
 * "undefined" errors, but instead log a warning to the console.
 *
 * @private
 * @returns A safe, non-functional `ILineToolsPlugin` object.
 */
function createDummyPluginApi() {
    const dummyFn = () => { console.error('Line Tools Plugin not initialized correctly.'); };
    const dummyFnString = () => { console.error('Line Tools Plugin not initialized correctly.'); return '[]'; };
    const dummyFnBoolean = () => { console.error('Line Tools Plugin not initialized correctly.'); return false; };
    return {
        registerLineTool: dummyFn,
        addLineTool: () => { console.error('Line Tools Plugin not initialized correctly.'); return ''; },
        createOrUpdateLineTool: dummyFn,
        removeLineToolsById: dummyFn,
        removeLineToolsByIdRegex: dummyFn,
        removeSelectedLineTools: dummyFn,
        removeAllLineTools: dummyFn,
        getSelectedLineTools: dummyFnString,
        getLineToolByID: dummyFnString,
        getLineToolsByIdRegex: dummyFnString,
        applyLineToolOptions: dummyFnBoolean,
        exportLineTools: dummyFnString,
        importLineTools: dummyFnBoolean,
        subscribeLineToolsDoubleClick: dummyFn,
        unsubscribeLineToolsDoubleClick: dummyFn,
        subscribeLineToolsAfterEdit: dummyFn,
        unsubscribeLineToolsAfterEdit: dummyFn,
        setCrossHairXY: dummyFn,
        clearCrossHair: dummyFn,
    };
}

export { AnchorPoint, BaseLineTool, Box, BoxHorizontalAlignment, BoxVerticalAlignment, CircleRenderer, CompositeRenderer, DataSource, Delegate, FinalizationMethod, HalfPlane, HitTestResult, HitTestType, InteractionManager, InteractionPhase, LineAnchorRenderer, LineCap, LineEnd, LineJoin, LineToolPaneView, LineToolsCorePlugin, MINIMUM_PADDING_PIXELS, OffScreenState, PaneCursorType, Point, PolygonRenderer, PriceAxisLabelStackingManager, PriceDataSource, RectangleRenderer, SegmentRenderer, TextAlignment, TextRenderer, ToolRegistry, assert, cacheCanvas, clearRect, clearRectWithGradient, clipPolygonToViewport, computeDashPattern, computeEndLineSize, convertDateStringToUTCTimestamp, convertUTCTimestampToDateString, createCacheCanvas, createLineToolsPlugin, deepCopy, defaultFontFamily, distanceToLine, distanceToSegment, drawArrowEnd, drawCircleEnd, drawDashedLine, drawHorizontalLine, drawLine, drawRoundRect, drawSolidLine, drawVerticalLine, ensureDefined, ensureNotNull, equalBoxes, equalPoints, extendAndClipLineSegment, fillRectWithBorder, generateContrastColors, getArrowPoints, getBoxHeight, getBoxWidth, getCullingStateWithExtensions, getExtendedVisiblePriceRange, getFontAwareScale, getFontSize, getScaledBackgroundInflationX, getScaledBackgroundInflationY, getScaledBoxPaddingX, getScaledBoxPaddingY, getScaledFontSize, getScaledPadding, getToolBoundingBox, getToolCullingState, getViewportBounds, halfPlaneThroughPoint, interpolateLogicalIndexFromTime, interpolateTimeFromLogicalIndex, intersectLineAndBox, intersectLineSegmentAndBox, intersectLineSegments, intersectLines, intersectPolygonAndHalfPlane, intersectRayAndBox, isBoolean, isFullyTransparent, isInteger, isNumber, isRtl, isString, line, lineSegment, lineThroughPoints, makeFont, merge, pointInBox, pointInCircle, pointInHalfPlane, pointInPolygon, pointInTriangle, randomHash, rotatePoint, setLineDash, setLineStyle, textWrap };
//# sourceMappingURL=lightweight-charts-line-tools-core.js.map
