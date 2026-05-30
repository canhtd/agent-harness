# Sketch MCP API Notes

## Stack Layout

Sketch plugin API set `stackLayout` config, Sketch UI apply positions khi render. Plugin runtime KHÔNG reposition children, nhưng đọc lại positions sẽ thấy Sketch đã apply đúng.

### Direction Mapping (QUAN TRỌNG)

```
direction: 0 = HORIZONTAL (left to right)
direction: 1 = VERTICAL (top to bottom)
```

### Layer Order (QUAN TRỌNG)

Sketch stack children theo thứ tự layer list ĐẢO NGƯỢC. Layer cuối cùng (bottom of list) xuất hiện TRƯỚC (top/left). Nên add children theo thứ tự ngược: bottom content first, top content last.

### Vertical Stack (VStack)

```js
const g = new sketch.Group({ name: 'section', frame: new sketch.Rectangle(x, y, w, 10), parent })
g.stackLayout = { direction: 1, gap: 16 }
// direction: 1 = vertical (top to bottom)

// Add bottom item first, top item last
T('Body text', w, 14, 4, '#333333ff', g)     // appears at bottom
T('Title', w, 24, 7, '#1a1a1aff', g)         // appears at top
```

### Horizontal Stack (HStack)

```js
const g = new sketch.Group({ name: 'row', frame: new sketch.Rectangle(0, 0, 10, h), parent })
g.stackLayout = { direction: 0, gap: 12 }
// direction: 0 = horizontal (left to right)

// Add rightmost item first, leftmost item last
R(56, 56, '#ef4444ff', null, 8, g)  // appears at right
R(56, 56, '#10a37fff', null, 8, g)  // appears at left
```

### Stack Layout Properties

```js
g.stackLayout = {
  direction: 1,        // 0=horizontal, 1=vertical
  gap: 16,             // spacing between children (px)
  padding: 0,          // padding inside group
  alignItems: 0,       // 0=start, 1=center, 2=end
  justifyContent: 0,   // 0=start, 1=center, 2=end
  wraps: false,        // wrap to next line
  alignContent: 0,     // cross-axis alignment
  crossAxisGap: 0,     // gap for wrapped items
}
```

### Children Positioning

Children đặt tại `(0, 0)`. Sketch UI tự reposition dựa trên `gap`.

### Group Position Drift

Sau khi Sketch apply stack layout, group position có thể bị đẩy lên (y âm). Fix bằng cách reset position sau khi tạo xong:

```js
group.frame = new sketch.Rectangle(desiredX, desiredY, group.frame.width, group.frame.height)
```

### Text Fixed Width

Sketch auto-shrink text width. Dùng `fixedWidth` để giữ width cố định:

```js
const t = new sketch.Text({ text: 'Hello', frame: new sketch.Rectangle(0, 0, 200, 24), parent, style: {...} })
t.fixedWidth = true
```

## Smart Layout (cho Symbols)

```js
// Chỉ dùng cho SymbolMaster
master.smartLayout = sketch.SmartLayout.TopToBottom
// Options: TopToBottom, BottomToTop, LeftToRight, RightToLeft, HorizontallyCenter, VerticallyCenter
```

## Native Layout (alternative)

```js
const layout = NSClassFromString('MSInferredGroupLayout').alloc().init()
layout.setAxis(1) // 0=horizontal, 1=vertical
group.sketchObject.setGroupLayout(layout)
// Inferred layout: giữ spacing hiện tại giữa children khi resize
```

## Text Sizing

Sketch text frame height khác rendering height. Dùng `size * 1.5` cho frame height để tránh clipping:

```js
const h = Math.ceil(fontSize * 1.5)
new sketch.Text({ frame: new sketch.Rectangle(0, 0, w, h), ... })
```

## Creating Layers

### Text

```js
new sketch.Text({
  text: 'Hello',
  frame: new sketch.Rectangle(x, y, w, h),
  parent: group,
  style: {
    fontSize: 14,
    fontWeight: 5,         // 4=regular, 5=medium, 6=semibold, 7=bold
    textColor: '#1a1a1aff', // must include alpha
    fontFamily: 'Inter',
  }
})
```

### Rectangle with rounded corners

```js
const shape = new sketch.ShapePath({
  frame: new sketch.Rectangle(x, y, w, h),
  parent: group,
  style: {
    fills: [{ color: '#5E6AD2ff' }],
    borders: [{ color: '#26282cff', thickness: 1 }],
  },
  shapeType: sketch.ShapePath.ShapeType.Rectangle
})
shape.points.forEach(p => { p.cornerRadius = 8 })
```

### Circle

```js
new sketch.ShapePath({
  frame: new sketch.Rectangle(x, y, d, d),
  parent: group,
  style: { fills: [{ color: '#4CB782ff' }] },
  shapeType: sketch.ShapePath.ShapeType.Oval
})
```

## Document & Pages

```js
const doc = sketch.getSelectedDocument()
const page = doc.pages.find(p => p.name === 'Design System')
doc.selectedPage = page

// Create page
const newPage = new sketch.Page({ name: 'New Page', parent: doc })
```

## Extracting SVG Icons from Web (Linear)

```js
// Icons use <symbol id="..."> definitions
// Extract via Chrome MCP:
const el = document.getElementById('Project')
el.innerHTML // contains <path d="..."> data

// Or from <use href="#SymbolName"> links
const svg = linkElement.querySelector('svg use')
svg.getAttribute('href') // "#Project"
```

## Font Installation

Inter font: download from github.com/rsms/inter, copy .otf files to `~/Library/Fonts/`. Restart Sketch to pick up new fonts.

Verify in plugin:
```js
const t = new sketch.Text({ text: 'test', style: { fontFamily: 'Inter' } })
console.log(t.style.fontFamily) // 'Inter' if installed, 'Helvetica' if fallback
```
